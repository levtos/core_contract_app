from core_contracts.declarative import Evaluation, compile_definition
from core_contracts.declarative_models import DeclarativeDefinition
from core_contracts.quality import derive

from .test_core import NOW
from .test_declarative import definition, literal, schema


def test_valid_unassigned_value_has_independent_completeness_and_propagates():
    rule = {
        "op": "configuration_hint",
        "arg": literal("unassigned", "text"),
        "when": literal(True),
        "code": "activity_mapping_missing",
        "message": "Noch nicht zugeordnet",
    }
    data = definition(rule)
    data.update(language_version=2)
    data["schema"]["fields"]["value"] = schema("text")
    model = DeclarativeDefinition.model_validate(data)
    compile_definition(model)
    result = Evaluation(model, {}, NOW).evaluate(model.outputs["value"])
    assert result.status == "valid" and result.value == "unassigned" and result.quality == "healthy"
    assert not result.configuration.complete
    assert result.reasons == ()
    assert derive("other", [result], NOW).configuration == result.configuration
