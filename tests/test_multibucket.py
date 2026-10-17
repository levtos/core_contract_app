import copy

import pytest

from core_contracts.multibucket import MultiBucket
from core_contracts.quality import ReasonCode, unknown
from core_contracts.runtime import Runtime

from .conftest import activate
from .test_core import NOW
from .test_declarative import definition, literal, observation, registry, schema, value


def test_ordered_boundaries_equality_large_jumps_reset_and_unknown_initial():
    bucket = MultiBucket(("low", "middle", "high"), 1)

    def read(x, lower=18, upper=22):
        return bucket.classify(
            [value(x), value(10), value(20), value(lower), value(upper)],
            [(1, 1, 1), (2, 3, 4)],
            NOW,
        )

    assert read(21).value == "middle"
    assert read(22).value == "high"
    assert read(18).value == "high"
    assert read(17).value == "middle"
    assert read(-100).value == "low"
    assert read(100).value == "high"
    assert read(10).value == "middle"
    assert read(20, 22, 18).status == "unknown"
    assert bucket.index == 1
    missing = MultiBucket(("a", "b"), None)
    args = [value(20), value(20), value(18), value(22)]
    assert missing.classify(args, [(1, 2, 3)], NOW).status == "unknown"
    args[0] = value(22)
    assert missing.classify(args, [(1, 2, 3)], NOW).value == "b"
    args[0] = unknown(ReasonCode.INPUT_UNKNOWN, "x", NOW)
    assert missing.classify(args, [(1, 2, 3)], NOW).status == "unknown"
    assert missing.index is None


async def test_input_boundaries_change_without_refreshing_measurement_and_restart_resets_latch(
    runtime, config
):
    output = {
        "op": "bucket",
        "id": "classes",
        "arg": {"op": "input", "name": "a"},
        "classes": ["low", "high"],
        "initial": {"class": "low"},
        "schema": schema("enum", value_catalog=["low", "high"]),
        "boundaries": [{"at": {"op": "input", "name": "b"}}],
    }
    data = definition(output)
    data.update(language_version=2)
    data["inputs"] = [{"name": name, "schema": schema("number")} for name in ("a", "b")]
    data["schema"]["fields"]["value"] = output["schema"]
    doc = registry(config, data)
    source = copy.deepcopy(doc["sources"][0])
    source.update(source_id="source.b", physical_source_key="b")
    binding = copy.deepcopy(doc["bindings"][0])
    binding.update(binding_id="binding.b", source_id="source.b")
    binding["adapter"]["ha_entity_id"] = "sensor.second"
    doc["sources"].append(source)
    doc["bindings"].append(binding)
    doc["contracts"][0]["inputs"].append({"name": "b", "ref": "source.b"})
    await activate(runtime, doc)
    await runtime.submit("observation", observation(runtime, 20))
    await runtime.submit("observation", observation(runtime, 30, name="b"))
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == "low"
    stamp = runtime.state.tables["source_observation_current"]["binding.a"]["received_at"]
    runtime.clock.advance(1)
    await runtime.submit("observation", observation(runtime, 10, name="b"))
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == "high"
    assert runtime.state.tables["source_observation_current"]["binding.a"]["received_at"] == stamp
    await runtime.stop()
    restored = Runtime(runtime.store, runtime.clock, runtime.types)
    await restored.start()
    try:
        # Persisted sensor evidence is restored; no persisted bucket latch can make it valid.
        assert (
            restored.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["status"]
            == "unknown"
        )
    finally:
        await restored.stop()


def test_initial_and_static_boundaries_are_validated():
    from core_contracts.declarative_models import DeclarativeDefinition

    output = {
        "op": "bucket",
        "id": "x",
        "arg": literal(1, "number"),
        "classes": ["a", "b", "c"],
        "schema": schema("enum", value_catalog=["a", "b", "c"]),
        "initial": {"unknown": True},
        "boundaries": [{"at": literal(20, "number")}, {"at": literal(10, "number")}],
    }
    with pytest.raises(ValueError):
        DeclarativeDefinition.model_validate(definition(output))
