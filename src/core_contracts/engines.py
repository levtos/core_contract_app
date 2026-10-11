"""Code-owned engine catalog shared by discovery, typing and evaluation."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .fusion import Fusion
from .quality import FieldValue, ReasonCode, derive, unknown
from .resolver import FormulaCatalog
from .schema import FieldSchema


@dataclass(frozen=True)
class FormulaSchema:
    input: FieldSchema
    output: FieldSchema


FORMULAS = FormulaCatalog()
FORMULA_SCHEMAS: dict[tuple[str, int], FormulaSchema] = {}
FUSION = Fusion()
FUSION_INPUTS: dict[str, str | None] = {
    "first_healthy": None,
    "latest": None,
    "any_true": "bool",
    "all_true": "bool",
}


def register_formula(
    name: str,
    version: int,
    implementation: Any,
    input_schema: FieldSchema,
    output_schema: FieldSchema,
) -> None:
    FORMULAS.register(name, version, implementation)
    FORMULA_SCHEMAS[name, version] = FormulaSchema(input_schema, output_schema)


def register_fusion(name: str, implementation: Any, input_type: str | None = None) -> None:
    FUSION.register(name, implementation)
    FUSION_INPUTS[name] = input_type


def agreement(items: list[FieldValue], at: datetime) -> FieldValue:
    if any(not item.usable(at) for item in items):
        return unknown(ReasonCode.INPUT_UNKNOWN, "candidates", at)
    if any(item.value != items[0].value for item in items):
        return unknown(ReasonCode.CONFLICT, "candidates", at)
    return derive(items[0].value, items, at)


_number = FieldSchema(type="number", required=True, physical_state=False)
register_formula("test.sum", 1, sum, _number, _number)
register_fusion("test_agreement", agreement)
