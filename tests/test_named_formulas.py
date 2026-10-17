import copy

import pytest

from core_contracts.declarative import Evaluation, compile_definition
from core_contracts.declarative_models import DeclarativeDefinition
from core_contracts.engines import (
    FORMULA_SCHEMAS,
    FORMULAS,
    FormulaInput,
    register_formula,
    set_formula_lifecycle,
)
from core_contracts.schema import FieldSchema

from .test_core import NOW
from .test_declarative import definition, schema


def test_named_quantities_allow_mixed_units_and_require_explicit_names(monkeypatch):
    monkeypatch.setattr(FORMULAS, "_items", copy.copy(FORMULAS._items))
    monkeypatch.setitem(FORMULA_SCHEMAS, ("example.mixed", 1), None)
    temperature = FieldSchema.model_validate(schema("number", unit="°C"))
    humidity = FieldSchema.model_validate(schema("number", unit="%"))
    register_formula(
        "example.mixed",
        1,
        lambda args: args["temperature"],
        temperature,
        temperature,
        inputs=(
            FormulaInput("temperature", temperature, "temperature"),
            FormulaInput("humidity", humidity, "relative_humidity"),
        ),
        category="environment",
    )
    rule = {
        "op": "formula",
        "name": "example.mixed",
        "version": 1,
        "args": {
            "humidity": {"op": "literal", "schema": schema("number", unit="%"), "value": 50},
            "temperature": {"op": "literal", "schema": schema("number", unit="°C"), "value": 20},
        },
    }
    data = definition(rule)
    data.update(language_version=2)
    data["schema"]["fields"]["value"] = schema("number", unit="°C")
    model = DeclarativeDefinition.model_validate(data)
    compile_definition(model)
    assert Evaluation(model, {}, NOW).evaluate(model.outputs["value"]).value == 20
    del rule["args"]["humidity"]
    with pytest.raises(ValueError, match="formula_argument_names"):
        compile_definition(DeclarativeDefinition.model_validate(data))
    set_formula_lifecycle("example.mixed", 1, "deprecated")
    set_formula_lifecycle("example.mixed", 1, "retired")
    with pytest.raises(ValueError, match="lifecycle_transition"):
        set_formula_lifecycle("example.mixed", 1, "active")
    set_formula_lifecycle("example.mixed", 1, "active", reactivation_note="Explizite Freigabe")
