"""Data-only definitions use the same engines, transaction and restore boundary."""

import copy

import pytest
from pydantic import ValidationError

from core_contracts.declarative import Evaluation, check_definition, compile_definition
from core_contracts.declarative_models import DeclarativeDefinition
from core_contracts.quality import FieldValue
from core_contracts.registry import RegistryConfig, fingerprints, validate
from core_contracts.runtime import Runtime
from core_contracts.testing.contract_types import type_registry

from .conftest import activate
from .test_core import NOW
from .test_phase1a import field, observation


def schema(kind="bool", **kwargs):
    return dict(type=kind, required=True, physical_state=False, **kwargs)


def literal(value, kind="bool"):
    return dict(op="literal", value=value, schema=schema(kind))


def definition(rule=None):
    return dict(
        type_id="test.declarative",
        type_version=1,
        inputs=[dict(name="a", schema=schema())],
        schema=dict(fields={"value": schema()}, available_projection=["value"]),
        outputs={"value": rule or dict(op="input", name="a")},
    )


def registry(config, data):
    config["definitions"] = [data]
    config["sources"][0]["value_schema"] = schema()
    config["contracts"][0].update(type_id=data["type_id"], type_version=data["type_version"])
    return config


def value(item):
    return FieldValue(status="valid", value=item, quality="healthy", since_at=NOW)


@pytest.mark.parametrize(
    ("rule", "expected"),
    [
        (dict(op="not", args=[dict(op="input", name="a")]), False),
        (dict(op="and", args=[dict(op="input", name="a"), literal(False)]), False),
        (dict(op="or", args=[dict(op="input", name="a"), literal(False)]), True),
        (
            dict(
                op="compare", comparison="gt", left=literal(5, "number"), right=literal(3, "number")
            ),
            True,
        ),
        (dict(op="map", arg=literal("on", "text"), schema=schema(), entries={"on": True}), True),
        (
            dict(
                op="first_match",
                cases=[
                    dict(when=literal(False), then=literal(False)),
                    dict(when=literal(True), then=literal(True)),
                ],
            ),
            True,
        ),
        (dict(op="fusion", strategy="any_true", args=[literal(False), literal(True)]), True),
    ],
)
def test_closed_nested_operator_semantics(rule, expected):
    data = DeclarativeDefinition.model_validate(definition(rule))
    check_definition(data)
    assert (
        Evaluation(data, {"a": value(True)}, NOW).evaluate(data.outputs["value"]).value == expected
    )
    assert data.model_dump(mode="json")["schema"]["fields"]["value"]["type"] == "bool"


def test_formula_and_internal_dag():
    data = definition(
        dict(
            op="compare",
            comparison="eq",
            left=dict(op="ref", name="sum"),
            right=literal(5, "number"),
        )
    )
    data["rules"] = {
        "sum": dict(
            op="formula",
            name="test.sum",
            version=1,
            args=[literal(2, "number"), literal(3, "number")],
        )
    }
    parsed = DeclarativeDefinition.model_validate(data)
    check_definition(parsed)
    evaluation = Evaluation(parsed, {}, NOW)
    assert evaluation.evaluate(parsed.outputs["value"]).value is True
    assert evaluation.memo["sum"].value == 5


@pytest.mark.parametrize(
    ("change", "error"),
    [
        (lambda d: d.update(outputs={"value": literal("bad", "text")}), "rule_type_mismatch"),
        (
            lambda d: d.update(outputs={"value": dict(op="input", name="missing")}),
            "unknown_rule_input",
        ),
        (lambda d: d.update(rules={"x": dict(op="ref", name="x")}), "internal_cycle"),
        (lambda d: d.update(outputs={"value": dict(op="ref", name="missing")}), "unknown_internal"),
        (
            lambda d: d.update(
                outputs={
                    "value": dict(op="formula", name="exec", version=1, args=[literal(1, "number")])
                }
            ),
            "unknown_formula",
        ),
        (
            lambda d: d.update(rules={str("n" + str(i)): literal(True) for i in range(256)}),
            "definition_resource_limit",
        ),
    ],
)
def test_type_and_resource_rejection(change, error):
    data = definition()
    change(data)
    with pytest.raises(ValueError, match=error):
        compile_definition(DeclarativeDefinition.model_validate(data))


@pytest.mark.parametrize(
    "bad",
    [
        dict(op="python", code="return True"),
        dict(op="eval", expression="1"),
        dict(op="input", name="a", code="evil"),
        dict(op="not", args=[]),
        dict(op="literal", schema=schema(), value="true"),
    ],
)
def test_unregistered_execution_and_invalid_data_rejected(bad):
    with pytest.raises(ValidationError):
        DeclarativeDefinition.model_validate(definition(bad))


def test_duplicate_stateful_id_and_expansion_depth():
    temporal = dict(
        op="temporal",
        id="stable",
        operation="stable_for",
        duration_s=2,
        args=[dict(op="input", name="a")],
    )
    with pytest.raises(ValueError, match="duplicate_stateful_id"):
        check_definition(
            DeclarativeDefinition.model_validate(
                definition(dict(op="and", args=[temporal, temporal]))
            )
        )
    data = definition(dict(op="ref", name="n0"))
    data["rules"] = {f"n{i}": dict(op="ref", name=f"n{i + 1}") for i in range(17)}
    data["rules"]["n17"] = literal(True)
    with pytest.raises(ValueError, match="definition_resource_limit"):
        check_definition(DeclarativeDefinition.model_validate(data))


def test_registry_types_isolated_and_legacy_fingerprints(config):
    types = type_registry()
    before = fingerprints(validate(config, types), types)
    with_defaults = RegistryConfig.model_validate(config).model_dump(mode="json")
    assert fingerprints(validate(with_defaults, types), types) == before
    validate(registry(config, definition()), types)
    assert ("test.declarative", 1) not in types.types
    config["sources"][0]["value_schema"] = schema("number")
    with pytest.raises(ValueError, match="input_type_mismatch"):
        validate(config, types)


async def test_data_only_multifield_and_safe_trace(runtime, config):
    data = definition(dict(op="not", args=[dict(op="input", name="a")]))
    data["schema"]["fields"]["label"] = schema("enum", value_catalog=["on", "off"])
    data["outputs"]["label"] = dict(
        op="map",
        arg=dict(op="input", name="a"),
        schema=schema("enum", value_catalog=["on", "off"]),
        entries={"True": "on", "False": "off"},
    )
    await activate(runtime, registry(config, data))
    await runtime.submit("observation", observation(runtime, True))
    assert field(runtime)["value"] is False
    assert field(runtime, key="label")["value"] == "on"
    trace = runtime.state.tables["node_state"]["fixture.echo"]["trace"]
    assert trace["cost"] <= 512
    assert all("value" not in step for step in trace["steps"])
    await runtime.submit("observation", observation(runtime, "password-value"))
    assert field(runtime)["status"] == "unknown"
    assert "password-value" not in str(runtime.state.tables["node_state"]["fixture.echo"]["trace"])


async def test_temporal_internal_restore_and_deadline(runtime, config):
    data = definition(dict(op="ref", name="held"))
    data["rules"] = {
        "held": dict(
            op="temporal",
            id="grace",
            operation="grace",
            duration_s=10,
            args=[dict(op="input", name="a")],
        )
    }
    await activate(runtime, registry(config, data))
    await runtime.submit("observation", observation(runtime, True))
    runtime.clock.advance(1)
    await runtime.submit("observation", observation(runtime, None, availability="unavailable"))
    assert field(runtime)["status"] == "held"
    end = field(runtime)["held_until"]
    await runtime.stop()
    restarted = Runtime(runtime.store, runtime.clock, type_registry())
    await restarted.start()
    try:
        assert field(restarted)["held_until"] == end
        restarted.clock.advance(11)
        await restarted.submit("tick")
        assert field(restarted)["status"] == "unknown"
    finally:
        await restarted.stop()


async def test_two_internal_temporal_lifecycles(runtime, config):
    data = definition(
        dict(op="and", args=[dict(op="ref", name="fast"), dict(op="ref", name="slow")])
    )
    data["rules"] = {
        name: dict(
            op="temporal",
            id=name,
            operation="stable_for",
            duration_s=duration,
            args=[dict(op="input", name="a")],
        )
        for name, duration in (("fast", 2), ("slow", 5))
    }
    await activate(runtime, registry(config, data))
    await runtime.submit("observation", observation(runtime, True))
    runtime.clock.advance(2)
    await runtime.submit("tick")
    assert field(runtime)["value"] is False
    runtime.clock.advance(3)
    await runtime.submit("tick")
    assert field(runtime)["value"] is True
    assert set(runtime.state.tables["node_state"]["fixture.echo"]["rules"]) == {"fast", "slow"}


def machine_definition():
    data = definition(dict(op="machine"))
    data["schema"]["fields"]["value"] = schema("enum", value_catalog=["idle", "active", "done"])
    data["machine"] = dict(
        id="lifecycle",
        states=["idle", "active", "done"],
        initial="idle",
        deadline_s=10,
        sessions=True,
        reinitialize_when=dict(op="input", name="a"),
        commands={"start": dict(arguments={"confirm": schema()})},
        transitions=[
            dict(
                source="idle",
                target="active",
                event="start",
                guard=dict(op="input", name="a"),
                argument_equals={"confirm": True},
                reason="requested",
            ),
            dict(
                source="active",
                target="done",
                event="deadline",
                guard=literal(True),
                reason="elapsed",
                ends_episode=True,
            ),
        ],
    )
    return data


async def test_declarative_machine_commands_restore(runtime, config):
    from datetime import timedelta
    from uuid import uuid4

    data = machine_definition()
    await activate(runtime, registry(config, data))
    await runtime.submit("observation", observation(runtime, True))
    command = dict(
        command_id=str(uuid4()),
        contract_id="fixture.echo",
        command="start",
        args={"confirm": True},
        origin=dict(kind="test", actor="test", client_name="test"),
        issued_at=runtime.clock.now_utc(),
        valid_until=runtime.clock.now_utc() + timedelta(seconds=30),
    )
    result = await runtime.submit("command", command)
    assert result["status"] == "accepted"
    assert field(runtime)["value"] == "active"
    seq = runtime.state.publication_seq
    assert await runtime.submit("command", command) == result
    assert runtime.state.publication_seq == seq
    state = copy.deepcopy(runtime.state.tables["sm_instance"]["fixture.echo"])
    await runtime.stop()
    restarted = Runtime(runtime.store, runtime.clock, type_registry())
    await restarted.start()
    try:
        assert (
            restarted.state.tables["sm_instance"]["fixture.echo"]["deadline"] == state["deadline"]
        )
        restarted.clock.advance(11)
        await restarted.submit("tick")
        assert field(restarted)["value"] == "done"
    finally:
        await restarted.stop()
