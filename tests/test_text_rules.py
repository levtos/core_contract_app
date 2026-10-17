import pytest

from core_contracts.declarative import Evaluation, compile_definition
from core_contracts.declarative_models import DeclarativeDefinition

from .test_core import NOW
from .test_declarative import definition, literal, schema


@pytest.mark.parametrize(
    "op,values,expected",
    [
        ("lower", ["ÄBC"], "äbc"),
        ("strip", [" x \n"], "x"),
        ("normalize_key", ["  The--TITLE__Name "], "the title name"),
        ("contains", ["serie episode", "episode"], True),
        ("matches", ["episode-12", "episode-??"], True),
        ("compound_key", ["a|b", "c"], '["a|b","c"]'),
    ],
)
def test_closed_text_operations(op, values, expected):
    data = definition({"op": op, "args": [literal(v, "text") for v in values]})
    data.update(language_version=2)
    data["schema"]["fields"]["value"] = schema("bool" if type(expected) is bool else "text")
    model = DeclarativeDefinition.model_validate(data)
    compile_definition(model)
    assert Evaluation(model, {}, NOW).evaluate(model.outputs["value"]).value == expected


def test_text_unknown_is_not_empty_string_and_pattern_is_bounded():
    data = definition({"op": "lower", "args": [{"op": "input", "name": "a"}]})
    data.update(language_version=2)
    data["inputs"][0]["schema"] = schema("text")
    data["schema"]["fields"]["value"] = schema("text")
    model = DeclarativeDefinition.model_validate(data)
    assert Evaluation(model, {}, NOW).evaluate(model.outputs["value"]).status == "unknown"
