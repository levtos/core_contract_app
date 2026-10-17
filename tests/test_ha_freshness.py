import copy

import pytest

from .conftest import activate
from .test_declarative import observation


@pytest.mark.parametrize("mode", ["event_stateful", "periodic_ttl", "report_heartbeat"])
async def test_ha_disconnect_preserves_evidence_until_its_normal_expiry(runtime, config, mode):
    config["sources"][0]["freshness"].update(mode=mode)
    if mode != "event_stateful":
        config["sources"][0]["freshness"]["interval_s"] = 10
    await activate(runtime, config)
    await runtime.submit("bridge_state", ("connected", "connected"))
    await runtime.submit("observation", observation(runtime, True))
    before = copy.deepcopy(runtime.state.tables["source_observation_current"])
    runtime.clock.advance(1)
    await runtime.submit("bridge_state", ("unavailable", "disconnected"))
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["status"] == "valid"
    assert runtime.state.tables["source_observation_current"] == before
    assert runtime.service_state()["ha_unbounded_values"] == int(mode == "event_stateful")
    since = runtime.service_state()["ha_disconnected_since"]
    await runtime.submit("bridge_state", ("unavailable", "disconnected"))
    assert runtime.service_state()["ha_disconnected_since"] == since
    runtime.clock.advance(100)
    await runtime.submit("tick")
    result = runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]
    assert result["status"] == ("valid" if mode == "event_stateful" else "unknown")


async def test_connectivity_is_a_typed_contract_input_with_persisted_evidence(runtime, config):
    config["bindings"][0] = {
        "binding_id": "binding.a",
        "source_id": "source.a",
        "adapter": {"kind": "connectivity"},
    }
    config["sources"][0].update(
        source_type="state",
        value_schema={
            "type": "enum",
            "required": True,
            "physical_state": False,
            "value_catalog": ["ready", "starting", "unavailable"],
        },
    )
    config["dependencies"][0]["kind"] = "connectivity"
    await activate(runtime, config)
    await runtime.submit("bridge_state", ("connected", "starting"))
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == "starting"
    await runtime.submit("bridge_state", ("connected", "connected"))
    field = runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]
    assert field["value"] == "ready"
    assert await runtime.store.evidence(field["evidence"][0]) is not None
