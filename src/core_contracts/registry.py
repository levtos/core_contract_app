"""Stable identities, strict validation, graph ordering and semantic fingerprints."""

import re
from typing import Any, Literal, Self

from pydantic import Field, model_validator

from .adapters import AdapterConfig
from .evidence import Freshness
from .model import Model, canonical, semantic_fingerprint
from .schema import TypeRegistry


class Dependency(Model):
    dependency_id: str
    kind: Literal["ha", "mqtt", "other"]
    monitor: Literal["internal", "source"]


class Source(Model):
    source_id: str = Field(pattern=r"^source\.[a-zA-Z0-9_.-]+$")
    source_type: Literal["state", "attribute", "event", "numeric", "text", "boolean"]
    source_origin: str
    freshness: Freshness
    dependency_id: str
    physical_source_key: str = Field(min_length=1)
    display_name: str = ""


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


def safe_document(value: Any, depth: int = 0) -> None:
    if depth > 32:
        raise ValueError("document too deep")
    if isinstance(value, dict):
        for key, child in value.items():
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
    elif isinstance(value, list):
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
    if len(canonical(document).encode()) > 2_000_000:
        raise ValueError("document too large")
    safe_document(document)
    config = RegistryConfig.model_validate(document)
    for items, attribute in [
        (config.sources, "source_id"),
        (config.bindings, "binding_id"),
        (config.contracts, "contract_id"),
        (config.catalogs, "catalog_id"),
        (config.dependencies, "dependency_id"),
    ]:
        ids = [getattr(i, attribute) for i in items]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate identity / producer")
    sources = {s.source_id: s for s in config.sources}
    contracts = {c.contract_id: c for c in config.contracts}
    if sources.keys() & contracts.keys():
        raise ValueError("ambiguous identity")
    dependencies = {d.dependency_id for d in config.dependencies}
    catalogs = {c.catalog_id for c in config.catalogs}
    bound: set[str] = set()
    physical: set[str] = set()
    addresses: set[tuple[str | None, ...]] = set()
    for source in config.sources:
        if source.source_origin != "local" or source.dependency_id not in dependencies:
            raise ValueError("invalid source dependency/origin")
        if source.freshness.liveness_source and source.freshness.liveness_source not in sources:
            raise ValueError("unknown liveness source")
    for binding in config.bindings:
        adapter = binding.adapter
        address = (
            (adapter.kind, adapter.ha_entity_id, adapter.ha_attribute)
            if adapter.kind.startswith("ha_")
            else (adapter.kind, adapter.mqtt_topic, adapter.mqtt_value_path)
        )
        if adapter.kind != "scheduler" and address in addresses:
            raise ValueError("duplicate adapter evidence path")
        addresses.add(address)
        if binding.source_id not in sources or binding.source_id in bound:
            raise ValueError("source binding missing or duplicate")
        key = sources[binding.source_id].physical_source_key
        if key in physical:
            raise ValueError("duplicate physical evidence path")
        physical.add(key)
        bound.add(binding.source_id)
        if (
            binding.transform
            and binding.transform.kind == "map_ref"
            and binding.transform.catalog_id not in catalogs
        ):
            raise ValueError("unknown catalog")
    for contract in config.contracts:
        try:
            declaration = types.get(contract.type_id, contract.type_version)
        except KeyError as error:
            raise ValueError("config_incomplete: type or parameters") from error
        declaration.parameters.model_validate(contract.parameters)
        names = [i.name for i in contract.inputs]
        allowed = {i.name for i in declaration.inputs}
        required = {i.name for i in declaration.inputs if i.required}
        if len(set(names)) != len(names) or not required.issubset(names) or set(names) - allowed:
            raise ValueError("config_incomplete: inputs")
        for item in contract.inputs:
            ref, field = resolve_ref(item.ref, config)
            if field is None:
                if ref not in bound:
                    raise ValueError("unbound source")
            else:
                target = contracts[ref]
                if field not in types.get(target.type_id, target.type_version).schema.fields:
                    raise ValueError("unknown contract field")
                if contract.enabled and not target.enabled:
                    raise ValueError("disabled required dependency")
    topological(config)
    return config


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
    result: dict[str, str] = {}
    for source in config.sources:
        bindings = [
            b.model_dump(mode="json") for b in config.bindings if b.source_id == source.source_id
        ]
        result[source.source_id] = semantic_fingerprint(
            {
                "source": source.model_dump(mode="json"),
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
    for contract in topological(config):
        result[contract.contract_id] = semantic_fingerprint(
            {
                "definition": types.get(contract.type_id, contract.type_version).description(),
                "contract": contract.model_dump(mode="json", exclude={"enabled"}),
                "inputs": [result[resolve_ref(i.ref, config)[0]] for i in contract.inputs],
            }
        )
    return result


def diff(before: RegistryConfig | None, after: RegistryConfig) -> dict[str, list[str]]:
    old = {c.contract_id: c for c in before.contracts} if before else {}
    new = {c.contract_id: c for c in after.contracts}
    return {
        "added": sorted(new.keys() - old.keys()),
        "removed": sorted(old.keys() - new.keys()),
        "changed": sorted(k for k in new.keys() & old.keys() if old[k] != new[k]),
    }
