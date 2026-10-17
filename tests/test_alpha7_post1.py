"""Alpha-7 correction: diagnostics change, the historical source lock does not."""

import copy

import pytest

from core_contracts.validation import RegistryValidationError

from .conftest import activate


async def test_unchanged_active_copy_valid_with_consistent_source_history(runtime, config):
    await activate(runtime, config)
    await activate(runtime, copy.deepcopy(config))
    result = await runtime.submit("validate", copy.deepcopy(config))
    assert result["valid"] is True
    assert runtime.state.active_revision == 2


async def test_optional_delta_flaps_only_when_heartbeat_input_expires_and_recovers(runtime, config):
    from core_contracts.evidence import Observation

    config["fingerprint_version"] = 2
    first = config["sources"][0]
    first["source_type"] = "numeric"
    first["value_schema"] = {"type": "number", "required": True, "physical_state": False}
    second = copy.deepcopy(first)
    second.update(source_id="source.b", physical_source_key="physical.b")
    second["freshness"] = {"mode": "report_heartbeat", "interval_s": 3600, "future_tolerance_s": 1}
    config["sources"].append(second)
    config["bindings"][0]["transform"]["target"] = "number"
    binding = copy.deepcopy(config["bindings"][0])
    binding.update(binding_id="binding.b", source_id="source.b")
    binding["adapter"]["ha_entity_id"] = "sensor.synthetic_b"
    config["bindings"].append(binding)
    numeric = {"type": "number", "required": True, "physical_state": False}
    config["definitions"] = [
        {
            "type_id": "test.optional_delta",
            "type_version": 1,
            "inputs": [{"name": name, "schema": numeric} for name in ("a", "b")],
            "schema": {
                "fields": {
                    "ready": {"type": "bool", "required": True, "physical_state": False},
                    "difference": {**numeric, "required": False},
                },
                "available_projection": ["ready"],
            },
            "outputs": {
                "ready": {
                    "op": "literal",
                    "value": True,
                    "schema": {"type": "bool", "required": True, "physical_state": False},
                },
                "difference": {
                    "op": "temporal",
                    "operation": "delta",
                    "id": "difference",
                    "duration_s": 300,
                    "args": [{"op": "input", "name": "a"}, {"op": "input", "name": "b"}],
                },
            },
        }
    ]
    config["contracts"][0].update(
        type_id="test.optional_delta",
        inputs=[{"name": name, "ref": f"source.{name}"} for name in ("a", "b")],
    )
    await activate(runtime, config)
    await runtime.submit("bridge_state", ("connected", "connected"))

    async def report(name, value):
        now = runtime.clock.now_utc()
        await runtime.submit(
            "observation",
            Observation(
                source_id=f"source.{name}",
                binding_id=f"binding.{name}",
                adapter="ha_state",
                value_raw=value,
                observation_kind="report",
                ha_last_reported=now,
                received_at=now,
                epoch_id=runtime.state.epoch_id,
                ingest_seq=runtime.state.publication_seq + 1,
            ),
        )

    def envelope():
        return runtime.state.tables["contract_state_current"]["fixture.echo"]

    await report("a", 21)
    await report("b", 20)
    assert envelope()["fields"]["difference"]["status"] == "valid"
    runtime.clock.advance(301)
    await runtime.submit("tick")
    assert envelope()["fields"]["difference"]["status"] == "valid"  # delta's 300 s is not a TTL
    for _ in range(3):
        runtime.clock.advance(3601)
        await runtime.submit("tick")
        difference = envelope()["fields"]["difference"]
        assert difference["status"] == "unknown"
        assert any(
            reason["code"] == "input_stale" and reason["input"] == "source.b"
            for reason in difference["reasons"]
        )
        assert envelope()["contract_health"] == "healthy"  # only the optional output failed
        await report("b", 20)
        assert envelope()["fields"]["difference"]["status"] == "valid"


async def test_historical_source_conflict_names_field_values_and_origin_revision(runtime, config):
    config["sources"][0]["display_name"] = "Fenster im Wohnzimmer"
    await activate(runtime, config)
    await activate(runtime, {**config, "sources": [], "bindings": [], "contracts": []})
    changed = copy.deepcopy(config)
    changed["sources"][0]["value_schema"] = {
        "type": "bool",
        "unit": "°C",
        "required": True,
        "physical_state": False,
    }
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", changed)
    issue = next(issue for issue in error.value.issues if issue.path.endswith("/unit"))
    assert issue.code == "immutable_source_type"
    assert issue.parameters == {
        "source_name": "Fenster im Wohnzimmer",
        "field": "value_schema/unit",
        "oldValue": None,
        "newValue": "°C",
        "revision": "1",
    }
    assert "Version 1" in issue.message
    assert "°C" in issue.message
    assert runtime.state.active_revision == 2
