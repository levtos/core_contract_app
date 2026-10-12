"""Stable identities, strict validation, graph ordering and semantic fingerprints."""

import re
from collections.abc import Iterator
from functools import cache, lru_cache
from itertools import islice
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
    fingerprint_version: Literal[1, 2] = 1
    dependencies: tuple[Dependency, ...]
    sources: tuple[Source, ...]
    bindings: tuple[Binding, ...]
    contracts: tuple[Contract, ...]
    catalogs: tuple[Catalog, ...]
    definitions: tuple[DeclarativeDefinition, ...] = Field(default=(), max_length=MAX_DEFINITIONS)


def storage_document(config: RegistryConfig) -> dict[str, Any]:
    """Keep released Alpha-3 v1 documents byte-semantically compatible.

    Actual Alpha-4 extensions remain explicit; never silently downgrade them.
    """
    document = config.model_dump(mode="json")
    if config.fingerprint_version == 1:
        document.pop("fingerprint_version")
    if not config.definitions:
        document.pop("definitions")
    for source in document["sources"]:
        if source["value_schema"] is None:
            source.pop("value_schema")
    return document


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

    @cache
    def monitored_fingerprint(key: str) -> str:
        dependency = dependencies[sources[key].dependency_id]
        if config.fingerprint_version == 2:
            liveness = sources[key].freshness.liveness_source
            return semantic_fingerprint(
                {
                    "fingerprint_version": 2,
                    "source": base_sources[key],
                    "dependency": dependency.model_dump(),
                    "monitor_source": monitored_fingerprint(dependency.source_id)
                    if dependency.source_id
                    else None,
                    "liveness_source": monitored_fingerprint(liveness) if liveness else None,
                }
            )
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
                **({"fingerprint_version": 2} if config.fingerprint_version == 2 else {}),
                "definition": types.get(contract.type_id, contract.type_version).description(),
                "contract": contract.model_dump(mode="json", exclude={"enabled"}),
                "inputs": [result[resolve_ref(i.ref, config)[0]] for i in contract.inputs],
            }
        )
    return result


def changed_paths(before: Any, after: Any, path: str = "") -> Iterator[str]:
    if before == after:
        return
    if isinstance(before, dict) and isinstance(after, dict):
        for key in sorted(before.keys() | after.keys()):
            child = path + "/" + key.replace("~", "~0").replace("/", "~1")
            if key not in before or key not in after:
                yield child
            else:
                yield from changed_paths(before[key], after[key], child)
    elif isinstance(before, (list, tuple)) and isinstance(after, (list, tuple)):
        for index in range(max(len(before), len(after))):
            if index >= len(before) or index >= len(after):
                yield path + f"/{index}"
            else:
                yield from changed_paths(before[index], after[index], path + f"/{index}")
    else:
        yield path or "/"


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
        paths = {
            key: list(islice(changed_paths(previous[key], current[key]), 1025)) for key in changed
        }
        objects[group]["field_paths"] = {key: values[:1024] for key, values in paths.items()}
        objects[group]["field_paths_truncated"] = sorted(
            key for key, values in paths.items() if len(values) > 1024
        )
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
    source_ids = {s.source_id for s in after.sources} | (
        {s.source_id for s in before.sources} if before else set()
    )
    changed_sources.update(key for key in fingerprint_changed if key in source_ids)
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
    after_types = registry_types(after, types) if types else None
    before_types = registry_types(before, types) if types and before else None
    if types:
        assert after_types is not None
        stateful = sorted(
            c.contract_id
            for c in after.contracts
            if c.contract_id in fingerprint_changed
            and after_types.get(c.type_id, c.type_version).restore
        )
    previous_sources = {s.source_id: s for s in before.sources} if before else {}
    current_sources = {s.source_id: s for s in after.sources}
    identity_changes = set(previous_sources.keys() ^ current_sources.keys())
    identity_changes.update(
        key
        for key in previous_sources.keys() & current_sources.keys()
        if (previous_sources[key].physical_source_key, previous_sources[key].source_origin)
        != (current_sources[key].physical_source_key, current_sources[key].source_origin)
    )
    previous_bindings = {b.binding_id: b for b in before.bindings} if before else {}
    current_bindings = {b.binding_id: b for b in after.bindings}
    binding_identities = sorted(
        key
        for key in previous_bindings.keys() | current_bindings.keys()
        if key not in previous_bindings
        or key not in current_bindings
        or (previous_bindings[key].source_id, previous_bindings[key].adapter)
        != (current_bindings[key].source_id, current_bindings[key].adapter)
    )
    for key in binding_identities:
        identity_changes.update(
            bindings[key].source_id
            for bindings in (previous_bindings, current_bindings)
            if key in bindings
        )
    result.update(
        objects=objects,
        directly_affected_contracts=sorted(direct),
        transitively_affected_contracts=sorted(affected - direct),
        affected_contracts=sorted(affected),
        affected_fields={
            key: sorted(
                set(
                    after_types.get(new[key].type_id, new[key].type_version).schema.fields
                    if after_types and key in new
                    else ()
                )
                | set(
                    before_types.get(old[key].type_id, old[key].type_version).schema.fields
                    if before_types and key in old
                    else ()
                )
            )
            for key in sorted(affected)
        },
        fingerprint_version={
            "before": before.fingerprint_version if before else None,
            "after": after.fingerprint_version,
            "context_migration": bool(
                before and before.fingerprint_version != after.fingerprint_version
            ),
        },
        fingerprint_changes=fingerprint_changed,
        source_identity_changes=sorted(identity_changes),
        binding_identity_changes=binding_identities,
        changed_source_fingerprints=sorted(key for key in fingerprint_changed if key in source_ids),
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
