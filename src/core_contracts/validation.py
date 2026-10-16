"""Safe aggregate diagnostics with JSON Pointer locations, shared by all writers."""

import re
from typing import Any

from pydantic import ValidationError

from .declarative import DefinitionValidationErrors, RuleValidationError, all_rules, compatible
from .declarative_models import DeclarativeDefinition
from .model import Model, canonical
from .registry import (
    Binding,
    Catalog,
    Contract,
    Dependency,
    RegistryConfig,
    Source,
    _compile_definition,
    resolve_ref,
    safe_document,
    topological,
)
from .schema import FieldSchema, TypeRegistry


class ValidationIssue(Model):
    code: str
    path: str
    object_id: str | None = None
    message: str
    parameters: dict[str, str | None] | None = None


class RegistryValidationError(ValueError):
    def __init__(self, issues: list[ValidationIssue]) -> None:
        self.issues = issues
        super().__init__(issues[0].message)


def pointer(parts: tuple[str | int, ...]) -> str:
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def validate_document(
    document: Any, base: TypeRegistry, *, partial: bool = False
) -> RegistryConfig:
    issues: list[ValidationIssue] = []

    def add(
        code: str,
        path: str,
        message: str,
        identity: str | None = None,
        parameters: dict[str, str | None] | None = None,
    ) -> None:
        issues.append(
            ValidationIssue(
                code=code, path=path, object_id=identity, message=message, parameters=parameters
            )
        )

    if not isinstance(document, dict):
        raise RegistryValidationError(
            [
                ValidationIssue(
                    code="document_object_required",
                    path="/",
                    message="configuration object required",
                )
            ]
        )
    try:
        safe_document(document)
        if len(canonical(document).encode()) > 2_000_000:
            raise ValueError("document too large")
    except ValueError, TypeError, AttributeError:
        raise RegistryValidationError(
            [
                ValidationIssue(
                    code="unsafe_document",
                    path="/",
                    message="unsafe or oversized configuration document",
                )
            ]
        ) from None
    try:
        config = RegistryConfig.model_validate(document)
    except ValidationError as error:
        for finding in error.errors(include_url=False, include_input=False):
            parts = finding["loc"]
            obj: Any = document
            identity = None
            for part in parts:
                try:
                    obj = obj[part]
                except KeyError, IndexError, TypeError:
                    break
                if isinstance(obj, dict):
                    identity = next(
                        (
                            obj[k]
                            for k in (
                                "contract_id",
                                "source_id",
                                "binding_id",
                                "dependency_id",
                                "catalog_id",
                                "type_id",
                            )
                            if isinstance(obj.get(k), str)
                        ),
                        identity,
                    )
            # Pydantic messages/ctx can contain submitted values. Return only codes.
            add(
                "schema." + finding["type"], pointer(parts), "invalid configuration field", identity
            )
        # Also inspect independent, structurally valid objects. The temporary
        # subset is never saved or activated, and findings retain original indices.
        if not partial and document.get("config_schema_version") == 1:
            subset: dict[str, Any] = {
                "config_schema_version": 1,
                "fingerprint_version": document.get("fingerprint_version", 1)
                if document.get("fingerprint_version", 1) in (1, 2)
                else 1,
            }
            indices: dict[str, list[int]] = {}
            for group, model in (
                ("dependencies", Dependency),
                ("sources", Source),
                ("bindings", Binding),
                ("catalogs", Catalog),
                ("contracts", Contract),
                ("definitions", DeclarativeDefinition),
            ):
                subset[group], indices[group] = [], []
                raw = document.get(group, [])
                if not isinstance(raw, (list, tuple)):
                    continue
                for index, item in enumerate(raw):
                    try:
                        model.model_validate(item)
                    except ValidationError:
                        continue
                    subset[group].append(item)
                    indices[group].append(index)
            try:
                validate_document(subset, base, partial=True)
            except RegistryValidationError as independent:
                for issue in independent.issues:
                    segments = issue.path.split("/")
                    if len(segments) > 2 and segments[1] in indices and segments[2].isdigit():
                        segments[2] = str(indices[segments[1]][int(segments[2])])
                    issues.append(issue.model_copy(update={"path": "/".join(segments)}))
        raise RegistryValidationError(issues) from None

    types = TypeRegistry()
    types.types.update(base.types)
    if config.definitions and config.fingerprint_version != 2:
        add(
            "fingerprint_upgrade_required",
            "/fingerprint_version",
            "declarative definitions require fingerprint_version 2",
        )
    for index, definition in enumerate(config.definitions):
        try:
            types.register(_compile_definition(canonical(definition)))
        except DefinitionValidationErrors as error:
            for rule_issue in error.issues:
                add(
                    "definition." + str(rule_issue),
                    f"/definitions/{index}" + rule_issue.path,
                    str(rule_issue),
                    definition.type_id,
                )
        except RuleValidationError as error:
            add(
                "definition." + str(error),
                f"/definitions/{index}" + error.path,
                str(error),
                definition.type_id,
            )
        except ValueError as error:
            add("definition_invalid", f"/definitions/{index}", str(error), definition.type_id)

    for name, attribute in (
        ("sources", "source_id"),
        ("bindings", "binding_id"),
        ("contracts", "contract_id"),
        ("catalogs", "catalog_id"),
        ("dependencies", "dependency_id"),
    ):
        seen: set[str] = set()
        for index, item in enumerate(getattr(config, name)):
            key = getattr(item, attribute)
            if len(key) > 128 or not re.fullmatch(
                r"[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*", key
            ):
                add(
                    "identity_invalid",
                    f"/{name}/{index}/{attribute}",
                    "Eine ID hat höchstens 128 Zeichen, beginnt mit A–Z oder a–z und enthält nur diese Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich. Kein Punkt am Ende.",
                    key,
                )
            if key in seen:
                add(
                    "duplicate_identity",
                    f"/{name}/{index}/{attribute}",
                    "duplicate identity / producer",
                    key,
                )
            seen.add(key)
    for index, definition in enumerate(config.definitions):
        if len(definition.type_id) > 128 or definition.type_id.endswith("."):
            add(
                "identity_invalid",
                f"/definitions/{index}/type_id",
                "Vorlagen-IDs haben höchstens 128 Zeichen und keinen Punkt am Ende.",
                definition.type_id,
            )
    sources = {s.source_id: s for s in config.sources}
    dependencies = {d.dependency_id: d for d in config.dependencies}
    contracts = {c.contract_id: c for c in config.contracts}
    catalogs = {c.catalog_id for c in config.catalogs}
    if config.fingerprint_version == 2:
        visited_sources: set[str] = set()
        active_sources: set[str] = set()
        source_depths: dict[str, int] = {}

        def visit_source(key: str, depth: int = 0) -> None:
            if key in active_sources or depth > 64:
                raise ValueError("source dependency cycle or depth limit")
            if key in visited_sources or key not in sources:
                return
            active_sources.add(key)
            source = sources[key]
            dependency = dependencies.get(source.dependency_id)
            references = (
                source.freshness.liveness_source,
                dependency.source_id if dependency else None,
            )
            for reference in references:
                if reference:
                    visit_source(reference, depth + 1)
            source_depths[key] = 1 + max(
                (source_depths.get(ref, 0) for ref in references if ref), default=0
            )
            if source_depths[key] > 64:
                raise ValueError("source dependency depth limit")
            active_sources.remove(key)
            visited_sources.add(key)

        for index, source in enumerate(config.sources):
            try:
                visit_source(source.source_id)
            except ValueError:
                add(
                    "source_dependency_cycle",
                    f"/sources/{index}/freshness",
                    "source dependency cycle or depth limit",
                    source.source_id,
                )
                active_sources.clear()
    for index, source in enumerate(config.sources):
        path, key = f"/sources/{index}", source.source_id
        if key in contracts:
            add("ambiguous_identity", path + "/source_id", "ambiguous identity", key)
        if source.dependency_id not in dependencies or source.source_origin != "local":
            add(
                "source_dependency",
                path + "/dependency_id",
                "invalid source dependency/origin",
                key,
            )
        if source.freshness.liveness_source and source.freshness.liveness_source not in sources:
            add(
                "liveness_reference",
                path + "/freshness/liveness_source",
                "unknown liveness source",
                key,
            )
    for index, dependency in enumerate(config.dependencies):
        path, key = f"/dependencies/{index}", dependency.dependency_id
        if dependency.monitor == "source":
            if dependency.source_id not in sources:
                add(
                    "monitor_required",
                    path + "/source_id",
                    "dependency monitor source required",
                    key,
                )
        elif dependency.kind == "other" or dependency.source_id is not None:
            add(
                "monitor_unsupported",
                path + "/monitor",
                "unsupported internal dependency monitor",
                key,
            )
        visited: set[str] = set()
        current = dependency
        while current.source_id in sources:
            if current.dependency_id in visited:
                add("dependency_cycle", path + "/source_id", "dependency monitor cycle", key)
                break
            visited.add(current.dependency_id)
            next_dependency = dependencies.get(sources[current.source_id].dependency_id)
            if next_dependency is None:
                break
            current = next_dependency
    bound: set[str] = set()
    physical: set[str] = set()
    addresses: set[tuple[str | None, ...]] = set()
    for index, binding in enumerate(config.bindings):
        path, key, adapter = f"/bindings/{index}", binding.binding_id, binding.adapter
        if adapter.kind == "scheduler":
            add(
                "adapter_unsupported",
                path + "/adapter/kind",
                "scheduler source adapter not implemented",
                key,
            )
        address = (
            (adapter.kind, adapter.ha_entity_id, adapter.ha_attribute)
            if adapter.kind.startswith("ha_")
            else (adapter.kind, adapter.mqtt_topic, adapter.mqtt_value_path)
        )
        if address in addresses:
            add("duplicate_adapter", path + "/adapter", "duplicate adapter evidence path", key)
        addresses.add(address)
        if binding.source_id not in sources or binding.source_id in bound:
            add("binding_source", path + "/source_id", "source binding missing or duplicate", key)
        else:
            physical_key = sources[binding.source_id].physical_source_key
            if physical_key in physical:
                add(
                    "duplicate_evidence",
                    path + "/source_id",
                    "duplicate physical evidence path",
                    key,
                )
            physical.add(physical_key)
        bound.add(binding.source_id)
        if (
            binding.transform
            and binding.transform.kind == "map_ref"
            and binding.transform.catalog_id not in catalogs
        ):
            add("catalog_reference", path + "/transform/catalog_id", "unknown catalog", key)
        declared_source = sources.get(binding.source_id)
        declared_schema = declared_source.value_schema if declared_source else None
        source_kind = {"boolean": "bool", "numeric": "number", "text": "text"}.get(
            declared_source.source_type if declared_source else ""
        )
        if declared_schema and source_kind and declared_schema.type != source_kind:
            add(
                "source_type_mismatch",
                path + "/source_id",
                "Quellentyp und Wertschema passen nicht zusammen.",
                binding.source_id,
            )
        expected_kind = declared_schema.type if declared_schema else source_kind
        if (
            adapter.kind == "ha_state"
            and expected_kind in {"number", "bool"}
            and binding.transform is None
        ):
            add(
                "binding_cast_required",
                path + "/transform",
                f"Quelle {binding.source_id} erwartet {expected_kind}; Home-Assistant-Text benötigt eine ausdrückliche Umwandlung.",
                binding.source_id,
            )
        if binding.transform and expected_kind:
            result_kind = (
                "number" if binding.transform.kind == "unit_scale" else binding.transform.target
            )
            if (
                binding.transform.kind in {"type_cast", "unit_scale"}
                and result_kind != expected_kind
            ):
                add(
                    "binding_type_mismatch",
                    path + "/transform",
                    f"Quelle {binding.source_id} erwartet {expected_kind}; die Umwandlung liefert {result_kind}.",
                    key,
                    {"source": binding.source_id, "expected": expected_kind, "actual": result_kind},
                )
        if declared_schema and binding.transform:
            transform = binding.transform
            if transform.kind == "map_ref":
                catalog = next(
                    (c for c in config.catalogs if c.catalog_id == transform.catalog_id), None
                )
                if catalog and any(
                    not declared_schema.accepts(value) for value in catalog.entries.values()
                ):
                    add(
                        "catalog_type_mismatch",
                        path + "/transform/catalog_id",
                        "catalog output type mismatch",
                        key,
                    )
    for index, dependency in enumerate(config.dependencies):
        if dependency.source_id and dependency.source_id not in bound:
            add(
                "monitor_unbound",
                f"/dependencies/{index}/source_id",
                "unbound dependency monitor",
                dependency.dependency_id,
            )
    evaluation_cost = 0
    for index, contract in enumerate(config.contracts):
        path, key = f"/contracts/{index}", contract.contract_id
        try:
            declaration = types.get(contract.type_id, contract.type_version)
        except KeyError:
            add("type_reference", path + "/type_id", "config_incomplete: type or parameters", key)
            continue
        declared_definition = next(
            (
                d
                for d in config.definitions
                if (d.type_id, d.type_version) == (contract.type_id, contract.type_version)
            ),
            None,
        )
        if declared_definition and contract.enabled and declaration.definition is not None:
            evaluation_cost += 2 * len(all_rules(declared_definition))
        try:
            declaration.parameters.model_validate(contract.parameters)
        except ValidationError as error:
            for finding in error.errors(include_input=False, include_url=False):
                add(
                    "parameter." + finding["type"],
                    path + "/parameters" + (pointer(finding["loc"]) if finding["loc"] else ""),
                    "config_incomplete: type or parameters",
                    key,
                )
        if declaration.schema.grace_capable:
            duration = contract.parameters.get(declaration.schema.grace_parameter or "")
            if (
                not isinstance(duration, (int, float))
                or isinstance(duration, bool)
                or duration <= 0
            ):
                add(
                    "grace_duration",
                    path + "/parameters/" + (declaration.schema.grace_parameter or ""),
                    "positive grace parameter required",
                    key,
                )
        names = [i.name for i in contract.inputs]
        allowed = {i.name for i in declaration.inputs}
        required = {i.name for i in declaration.inputs if i.required}
        if len(set(names)) != len(names) or not required.issubset(names) or set(names) - allowed:
            add("contract_inputs", path + "/inputs", "config_incomplete: inputs", key)
        for position, item in enumerate(contract.inputs):
            location = path + f"/inputs/{position}/ref"
            try:
                ref, field = resolve_ref(item.ref, config)
            except ValueError:
                add("input_reference", location, "unknown reference", key)
                continue
            if item.name in declaration.refresh_inputs and (
                field is not None
                or not any(
                    b.source_id == ref and b.adapter.kind.startswith("ha_") for b in config.bindings
                )
            ):
                add("refresh_binding", location, "refresh requires HA source binding", key)
            actual: FieldSchema | None = None
            if field is None:
                if ref not in bound:
                    add("source_unbound", location, "unbound source", key)
                actual = sources[ref].value_schema
                if actual is None:
                    kind = {"boolean": "bool", "numeric": "number", "text": "text"}.get(
                        sources[ref].source_type
                    )
                    if kind:
                        actual = FieldSchema.model_validate(
                            {"type": kind, "required": True, "physical_state": False}
                        )
            else:
                target = contracts[ref]
                try:
                    actual = types.get(target.type_id, target.type_version).schema.fields.get(field)
                    if actual is None:
                        add("field_reference", location, "unknown contract field", key)
                except KeyError:
                    pass
                if contract.enabled and not target.enabled and item.name in required:
                    add("disabled_dependency", location, "disabled required dependency", key)
            declared = next(
                (
                    d
                    for d in config.definitions
                    if (d.type_id, d.type_version) == (contract.type_id, contract.type_version)
                ),
                None,
            )
            expected = (
                next((i.field_schema for i in declared.inputs if i.name == item.name), None)
                if declared
                else None
            )
            if expected and (actual is None or not compatible(actual, expected)):
                add(
                    "input_type_mismatch",
                    location,
                    f"Quelle {item.ref} liefert {actual.type if actual else 'keinen deklarierten Typ'} ({actual.unit if actual else 'keine Einheit'}); Eingang {item.name} erwartet {expected.type} ({expected.unit or 'keine Einheit'}).",
                    key,
                    {
                        "source": item.ref,
                        "input": item.name,
                        "actual": actual.type if actual else None,
                        "actualUnit": actual.unit if actual else None,
                        "expected": expected.type,
                        "expectedUnit": expected.unit,
                    },
                )
    if evaluation_cost > 8192:
        add(
            "registry_evaluation_limit",
            "/contracts",
            "declarative registry evaluation budget exceeded",
        )
    # Missing references have already been reported. A graph walk must not mask them.
    try:
        ordered = topological(config)
        depths: dict[str, int] = {}
        for contract in ordered:
            depths[contract.contract_id] = 1 + max(
                (depths.get(resolve_ref(item.ref, config)[0], 0) for item in contract.inputs),
                default=0,
            )
        if config.fingerprint_version == 2 and max(depths.values(), default=0) > 64:
            add("contract_graph_depth", "/contracts", "contract graph depth limit")
    except RecursionError:
        add("contract_graph_depth", "/contracts", "contract graph depth limit")
    except ValueError as error:
        if str(error) == "cycle":
            cycle_visited: set[str] = set()
            stack: list[str] = []

            def cycle(key: str) -> list[str]:
                if key in stack:
                    return stack[stack.index(key) :] + [key]
                if key in cycle_visited:
                    return []
                cycle_visited.add(key)
                stack.append(key)
                for item in contracts[key].inputs:
                    try:
                        target, field = resolve_ref(item.ref, config)
                    except ValueError:
                        continue
                    if field is not None:
                        found = cycle(target)
                        if found:
                            return found
                stack.pop()
                return []

            found = next((result for key in contracts if (result := cycle(key))), [])
            message = "Verträge verweisen im Kreis aufeinander: " + " → ".join(found)
            for left, right in zip(found, found[1:]):
                contract_index = next(
                    i for i, c in enumerate(config.contracts) if c.contract_id == left
                )
                for input_index, item in enumerate(contracts[left].inputs):
                    try:
                        target_id, _ = resolve_ref(item.ref, config)
                    except ValueError:
                        continue
                    if target_id == right:
                        add(
                            "contract_cycle",
                            f"/contracts/{contract_index}/inputs/{input_index}/ref",
                            message,
                            left,
                        )
    if issues:
        raise RegistryValidationError(issues)
    return config
