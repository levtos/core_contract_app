"""Stable identities, strict validation, graph ordering and semantic fingerprints."""

import re
from functools import lru_cache
from typing import Any, Literal, Self

from pydantic import Field, model_validator

from .adapters import AdapterConfig
from .declarative_models import MAX_DEFINITIONS, DeclarativeDefinition
from .evidence import Freshness
from .model import Model, canonical, semantic_fingerprint
from .schema import ContractType, FieldSchema, TypeRegistry


class Dependency(Model):
    dependency_id: str
    kind: Literal["ha", "mqtt", "other"]
    monitor: Literal["internal", "source"]
    source_id: str | None = None


class Source(Model):
    source_id: str = Field(pattern=r"^source\.[a-zA-Z0-9_.-]+$")
    source_type: Literal["state", "attribute", "event", "numeric", "text", "boolean"]
    source_origin: str
    freshness: Freshness
    dependency_id: str
    physical_source_key: str = Field(min_length=1)
    display_name: str = ""
    value_schema: FieldSchema | None = None


class Transform(Model):
    kind: Literal["type_cast", "unit_scale", "map_ref"]
    target: Literal["bool", "number", "text"] | None = None
    factor: float | None = None
    offset: float | None = None
    catalog_id: str | None = None

    @model_validator(mode="after")
    def complete(self) -> Self:
        if self.kind == "type_cast" and self.target is None:
            raise ValueError("target required")
        if self.kind == "unit_scale" and (self.factor is None or self.offset is None):
            raise ValueError("factor and offset required")
        if self.kind == "map_ref" and not self.catalog_id:
            raise ValueError("catalog required")
        return self


class Binding(Model):
    binding_id: str = Field(min_length=1)
    source_id: str
    adapter: AdapterConfig
    transform: Transform | None = None
    display_name: str = ""


class Input(Model):
    name: str
    ref: str


class Contract(Model):
    contract_id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_.-]+$")
    type_id: str
    type_version: int = Field(ge=1)
    enabled: bool
    inputs: tuple[Input, ...]
    parameters: dict[str, Any]
    display_name: str = ""
    description: str = ""


class Catalog(Model):
    catalog_id: str
    kind: Literal["map"]
    version: int = Field(ge=1)
    entries: dict[str, Any]


class RegistryConfig(Model):
    config_schema_version: Literal[1]
    dependencies: tuple[Dependency, ...]
    sources: tuple[Source, ...]
    bindings: tuple[Binding, ...]
    contracts: tuple[Contract, ...]
    catalogs: tuple[Catalog, ...]
    definitions: tuple[DeclarativeDefinition, ...] = Field(default=(), max_length=MAX_DEFINITIONS)


@lru_cache(maxsize=128)
def _compile_definition(document: str) -> ContractType:
    from .declarative import compile_definition

    return compile_definition(DeclarativeDefinition.model_validate_json(document))


def registry_types(config: RegistryConfig, base: TypeRegistry) -> TypeRegistry:
    """Compile into a revision-local registry; drafts cannot modify live types."""
    if not config.definitions:
        return base
    result = TypeRegistry()
    result.types.update(base.types)
    for definition in config.definitions:
        result.register(_compile_definition(canonical(definition)))
    return result


def safe_document(value: Any, depth: int = 0) -> None:
    if depth > 32:
        raise ValueError("document too deep")
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ValueError("document keys must be strings")
            if any(
                part in key.casefold()
                for part in (
                    "password",
                    "secret",
                    "token",
                    "credential",
                    "dsn",
                    "passwd",
                    "api_key",
                    "private_key",
                    "authorization",
                    "connection_string",
                    "database_url",
                )
            ):
                raise ValueError("sensitive key")
            safe_document(child, depth + 1)
    elif isinstance(value, (list, tuple)):
        for child in value:
            safe_document(child, depth + 1)
    elif isinstance(value, str) and re.search(r"\w+://[^\s/@]+:[^\s/@]+@", value):
        raise ValueError("credential URL")


def resolve_ref(ref: str, config: RegistryConfig) -> tuple[str, str | None]:
    if ref in {s.source_id for s in config.sources}:
        return ref, None
    for contract in sorted(config.contracts, key=lambda c: len(c.contract_id), reverse=True):
        if ref == contract.contract_id:
            return contract.contract_id, "value"
        if ref.startswith(contract.contract_id + "."):
            return contract.contract_id, ref[len(contract.contract_id) + 1 :]
    raise ValueError("unknown reference")


def validate(document: dict[str, Any], types: TypeRegistry) -> RegistryConfig:
    from .validation import validate_document

    return validate_document(document, types)


def required_sources(config: RegistryConfig) -> set[str]:
    """Sources reachable from enabled producers, including source monitors/liveness."""
    needed = {
        resolve_ref(i.ref, config)[0]
        for c in config.contracts
        if c.enabled
        for i in c.inputs
        if resolve_ref(i.ref, config)[1] is None
    }
    sources = {s.source_id: s for s in config.sources}
    dependencies = {d.dependency_id: d for d in config.dependencies}
    pending = list(needed)
    while pending:
        source = sources[pending.pop()]
        for ref in (source.freshness.liveness_source, dependencies[source.dependency_id].source_id):
            if ref and ref not in needed:
                needed.add(ref)
                pending.append(ref)
    return needed


def affected_sources(config: RegistryConfig, changed: set[str]) -> set[str]:
    dependencies = {d.dependency_id: d for d in config.dependencies}
    result = set(changed)
    while True:
        expanded = result | {
            s.source_id
            for s in config.sources
            if s.freshness.liveness_source in result
            or dependencies[s.dependency_id].source_id in result
        }
        if expanded == result:
            return result
        result = expanded


def topological(config: RegistryConfig) -> list[Contract]:
    contracts = {c.contract_id: c for c in config.contracts}
    visiting: set[str] = set()
    done: set[str] = set()
    ordered: list[Contract] = []

    def visit(key: str) -> None:
        if key in visiting:
            raise ValueError("cycle")
        if key in done:
            return
        visiting.add(key)
        for item in contracts[key].inputs:
            ref, field = resolve_ref(item.ref, config)
            if field is not None:
                visit(ref)
        visiting.remove(key)
        done.add(key)
        ordered.append(contracts[key])

    for key in contracts:
        visit(key)
    return ordered


def fingerprints(config: RegistryConfig, types: TypeRegistry) -> dict[str, str]:
    types = registry_types(config, types)
    result: dict[str, str] = {}
    for source in config.sources:
        bindings = [
            b.model_dump(mode="json") for b in config.bindings if b.source_id == source.source_id
        ]
        result[source.source_id] = semantic_fingerprint(
            {
                "source": source.model_dump(
                    mode="json", exclude={"value_schema"} if source.value_schema is None else set()
                ),
                "bindings": bindings,
                "catalogs": [
                    c.model_dump()
                    for c in config.catalogs
                    if any(
                        b.transform and b.transform.catalog_id == c.catalog_id
                        for b in config.bindings
                        if b.source_id == source.source_id
                    )
                ],
            }
        )
    base_sources = dict(result)
    dependencies = {d.dependency_id: d for d in config.dependencies}
    sources = {s.source_id: s for s in config.sources}

    def monitored_fingerprint(key: str) -> str:
        dependency = dependencies[sources[key].dependency_id]
        if dependency.source_id:
            return semantic_fingerprint(
                {
                    "source": base_sources[key],
                    "monitor": dependency.model_dump(),
                    "monitor_source": monitored_fingerprint(dependency.source_id),
                }
            )
        return base_sources[key]

    for key in sources:
        result[key] = monitored_fingerprint(key)
    for contract in topological(config):
        result[contract.contract_id] = semantic_fingerprint(
            {
                "definition": types.get(contract.type_id, contract.type_version).description(),
                "contract": contract.model_dump(mode="json", exclude={"enabled"}),
                "inputs": [result[resolve_ref(i.ref, config)[0]] for i in contract.inputs],
            }
        )
    return result


def diff(
    before: RegistryConfig | None, after: RegistryConfig, types: TypeRegistry | None = None
) -> dict[str, Any]:
    old = {c.contract_id: c for c in before.contracts} if before else {}
    new = {c.contract_id: c for c in after.contracts}
    result: dict[str, Any] = {
        "added": sorted(new.keys() - old.keys()),
        "removed": sorted(old.keys() - new.keys()),
        "changed": sorted(k for k in new.keys() & old.keys() if old[k] != new[k]),
    }
    objects: dict[str, Any] = {}
    changed_sources: set[str] = set()
    for group, identity in (
        ("dependencies", "dependency_id"),
        ("sources", "source_id"),
        ("bindings", "binding_id"),
        ("catalogs", "catalog_id"),
        ("contracts", "contract_id"),
        ("definitions", "type_id"),
    ):

        def entries(config: RegistryConfig | None) -> dict[str, Any]:
            return (
                {
                    (
                        f"{item.type_id}@{item.type_version}"
                        if group == "definitions"
                        else getattr(item, identity)
                    ): item.model_dump(mode="json")
                    for item in getattr(config, group)
                }
                if config
                else {}
            )

        previous, current = entries(before), entries(after)
        changed = sorted(k for k in previous.keys() & current.keys() if previous[k] != current[k])
        objects[group] = {
            "added": sorted(current.keys() - previous.keys()),
            "removed": sorted(previous.keys() - current.keys()),
            "changed": changed,
            "fields": {
                key: sorted(
                    name
                    for name in previous[key].keys() | current[key].keys()
                    if previous[key].get(name) != current[key].get(name)
                )
                for key in changed
            },
        }
        if group == "sources":
            changed_sources.update(objects[group]["added"] + objects[group]["removed"] + changed)
        if group == "bindings":
            for key in objects[group]["added"] + objects[group]["removed"] + changed:
                changed_sources.update(
                    item[key]["source_id"] for item in (previous, current) if key in item
                )
    old_fp = fingerprints(before, types) if before and types else {}
    new_fp = fingerprints(after, types) if types else {}
    fingerprint_changed = sorted(
        k for k in old_fp.keys() | new_fp.keys() if old_fp.get(k) != new_fp.get(k)
    )
    direct = set(result["added"] + result["changed"] + result["removed"])
    for config in (before, after):
        if not config:
            continue
        for contract in config.contracts:
            if any(resolve_ref(item.ref, config)[0] in changed_sources for item in contract.inputs):
                direct.add(contract.contract_id)
            definition_key = f"{contract.type_id}@{contract.type_version}"
            if any(
                definition_key in objects["definitions"][kind]
                for kind in ("added", "removed", "changed")
            ):
                direct.add(contract.contract_id)
    affected = set(direct)
    affected.update(k for k in fingerprint_changed if k in old or k in new)
    while True:
        expanded = set(affected)
        for config in (before, after):
            if config:
                expanded.update(
                    c.contract_id
                    for c in config.contracts
                    if any(resolve_ref(i.ref, config)[0] in affected for i in c.inputs)
                )
        if expanded == affected:
            break
        affected = expanded
    stateful = []
    if types:
        after_types = registry_types(after, types)
        stateful = sorted(
            c.contract_id
            for c in after.contracts
            if c.contract_id in fingerprint_changed
            and after_types.get(c.type_id, c.type_version).restore
        )
    result.update(
        objects=objects,
        directly_affected_contracts=sorted(direct),
        transitively_affected_contracts=sorted(affected - direct),
        affected_contracts=sorted(affected),
        fingerprint_changes=fingerprint_changed,
        source_identity_changes=sorted(changed_sources),
        possibly_invalidated_contexts=stateful,
        restore={
            "reinitialize_contracts": stateful,
            "retains_absolute_deadlines_if_compatible": True,
        },
        snapshot={"revision_changes": True, "affected_contracts": sorted(affected)},
        analysis="static",
        predicts_values=False,
    )
    return result
