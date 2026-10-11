"""Public editor contract. Capability metadata never changes legacy fingerprints."""

from typing import Any

from .declarative_models import MAX_DEPTH, MAX_FIELDS, MAX_INPUTS, MAX_NODES, DeclarativeDefinition
from .engines import FORMULA_SCHEMAS, FUSION_INPUTS
from .history import HistoryQuery
from .quality import ReasonCode
from .registry import RegistryConfig, registry_types
from .schema import TypeRegistry

REASONS = {
    ReasonCode.INPUT_UNAVAILABLE: "The source reports unavailable.",
    ReasonCode.INPUT_UNKNOWN: "Decisive input has no usable value.",
    ReasonCode.INPUT_STALE: "The measurement exceeds its configured freshness interval.",
    ReasonCode.INPUT_RESTORED: "Restored source data is not new measurement evidence.",
    ReasonCode.INPUT_ABSENT: "No observation exists for the required input.",
    ReasonCode.UNMAPPED_VALUE: "The map has no entry for this input.",
    ReasonCode.INVALID_VALUE: "The input does not satisfy its declared value type.",
    ReasonCode.NO_MATCH: "No first-match condition selected a result.",
    ReasonCode.CONFLICT: "Equally decisive candidates disagree.",
    ReasonCode.PARTIAL_EVIDENCE: "Usable candidates determine the result despite missing evidence.",
    ReasonCode.GRACE: "A previously valid value is held until its original grace deadline.",
    ReasonCode.SELECTION_BLOCKED: "An unknown earlier condition prevents deterministic selection.",
    ReasonCode.DEPENDENCY_UNAVAILABLE: "A declared runtime dependency is unavailable.",
    ReasonCode.CONFIG_INCOMPLETE: "The contract configuration is incomplete.",
    ReasonCode.EVALUATION_ERROR: "Producer evaluation failed; staged producer changes were discarded.",
    ReasonCode.RESTORE_MISSING: "Required persisted context is missing or inconsistent.",
    ReasonCode.RESTORE_INCOMPATIBLE: "The semantic fingerprint does not match the persisted context.",
    ReasonCode.RESTORE_STALE: "A disabled or removed instance requires reinitialization.",
    ReasonCode.HISTORY_GAP: "Observation continuity was interrupted.",
    ReasonCode.DEADLINE_OVERDUE: "A due transition could not be decided from current evidence.",
    ReasonCode.GUARD_REJECTED: "The transition guard rejected the request.",
}


def reasons() -> dict[str, Any]:
    return {
        "version": 1,
        "codes": [
            {"code": code.value, "description": REASONS[code], "since_version": 1}
            for code in ReasonCode
        ],
    }


def configuration_schema() -> dict[str, Any]:
    schema = RegistryConfig.model_json_schema()
    definitions = schema["$defs"]
    conditions = {
        "Transform": [
            ("kind", "type_cast", ["target"]),
            ("kind", "unit_scale", ["factor", "offset"]),
            ("kind", "map_ref", ["catalog_id"]),
        ],
        "Freshness": [
            ("mode", "report_heartbeat", ["interval_s"]),
            ("mode", "periodic_ttl", ["interval_s"]),
            ("mode", "liveness_source", ["interval_s", "liveness_source"]),
        ],
        "Dependency": [("monitor", "source", ["source_id"])],
        "AdapterConfig": [
            ("kind", "ha_state", ["ha_entity_id"]),
            ("kind", "ha_attribute", ["ha_entity_id", "ha_attribute"]),
            ("kind", "mqtt", ["mqtt_topic"]),
        ],
    }
    for name, rules in conditions.items():
        if name in definitions:
            definitions[name]["allOf"] = [
                {
                    "if": {"properties": {key: {"const": value}}, "required": [key]},
                    "then": {
                        "required": fields,
                        "properties": {field: {"not": {"type": "null"}} for field in fields},
                    },
                }
                for key, value, fields in rules
            ]
    return schema


def definition_schema() -> dict[str, Any]:
    schema = DeclarativeDefinition.model_json_schema()
    schema["$defs"]["FusionRule"]["properties"]["strategy"]["enum"] = sorted(FUSION_INPUTS)
    schema["$defs"]["FormulaRule"]["allOf"] = [
        {
            "if": {"properties": {"name": {"const": name}}},
            "then": {
                "properties": {
                    "version": {"enum": sorted(v for n, v in FORMULA_SCHEMAS if n == name)}
                }
            },
        }
        for name in sorted({name for name, _ in FORMULA_SCHEMAS})
    ]
    schema["$defs"]["FormulaRule"]["properties"]["name"]["enum"] = sorted(
        {name for name, _ in FORMULA_SCHEMAS}
    )
    return schema


def capabilities(config: RegistryConfig | None, base: TypeRegistry) -> dict[str, Any]:
    types = registry_types(config, base) if config else base
    return {
        "capability_version": 1,
        "language_versions": [1],
        "api_protocol": 1,
        "config_schema_version": 1,
        "compatibility": {
            "alpha3_documents": True,
            "alpha3_type_fingerprints": "unchanged",
            "definition_versions": "immutable_semantics",
            "activation": "explicit_atomic_occ",
        },
        "types": [item.description() for item in types.types.values()],
        "schemas": {
            "registry": configuration_schema(),
            "definition": definition_schema(),
            "history_query": HistoryQuery.model_json_schema(),
        },
        "operators": [
            {
                "op": name,
                "stateful": name in {"bucket", "temporal", "machine"},
                "schema_ref": f"#/$defs/{model}",
            }
            for name, model in (
                ("input", "InputRule"),
                ("ref", "ReferenceRule"),
                ("literal", "LiteralRule"),
                ("and", "BooleanRule"),
                ("or", "BooleanRule"),
                ("not", "BooleanRule"),
                ("compare", "CompareRule"),
                ("map", "MapRule"),
                ("first_match", "FirstMatchRule"),
                ("bucket", "BucketRule"),
                ("formula", "FormulaRule"),
                ("fusion", "FusionRule"),
                ("temporal", "TemporalRule"),
                ("machine", "MachineRule"),
                ("not_applicable", "NotApplicableRule"),
            )
        ],
        "formulas": [
            {
                "name": name,
                "version": version,
                "input_schema": item.input.model_dump(mode="json"),
                "output_schema": item.output.model_dump(mode="json"),
            }
            for (name, version), item in FORMULA_SCHEMAS.items()
        ],
        "fusion": [
            {
                "strategy": name,
                "priority": "argument_order" if name == "first_healthy" else None,
                "conflict_detection": name in {"latest", "test_agreement"},
            }
            for name in FUSION_INPUTS
        ],
        "temporal": [
            {
                "operation": name,
                "arguments": 2 if name == "delta" else 1,
                "stateful": name not in {"delta"},
                "restores_absolute_deadlines": True,
            }
            for name in ("stable_for", "dwell", "grace", "edge", "delta", "age")
        ],
        "state_machine": {
            "schema_ref": "#/$defs/MachineDefinition",
            "max_parallel_deadlines": 1,
            "guard_rules": "stateless; temporal truths can be supplied through contract inputs",
            "command_effect": "guarded_transition_only",
            "sessions": True,
            "episodes": True,
        },
        "references": {
            "external": ["source_id", "contract_id.field", "contract_id (value)"],
            "internal": "named acyclic rules",
            "dynamic_lookup": False,
            "typed_sources": "value_schema or boolean/numeric/text source_type",
        },
        "limits": {
            "document_bytes": 2_000_000,
            "document_depth": 32,
            "rule_depth": MAX_DEPTH,
            "definition_nodes": MAX_NODES,
            "evaluation_steps": MAX_NODES * 2,
            "inputs": MAX_INPUTS,
            "outputs": MAX_FIELDS,
            "definitions": 128,
            "drafts": 100,
            "history_page": 200,
            "trace_retention": "latest_committed_per_contract",
            "trace_values": "boolean_decisions_only",
            "trace_evidence_per_step": 64,
        },
        "reasons": reasons(),
    }
