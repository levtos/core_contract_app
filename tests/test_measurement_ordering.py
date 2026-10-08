"""Issue #3 / OPUS-RR-01: order evidence only on a shared measurement clock."""

from datetime import timedelta

import pytest

from core_contracts.adapters.ha import BridgeAdapter
from core_contracts.evidence import is_new, is_older

from .conftest import activate
from .test_remediation import field
from .test_runtime import obs


def ha_observation(bridge, value, *, device_time=None, kind="live_change"):
    """Use the real binding/adapter mapping, without opening a HA connection."""
    config = bridge.runtime.config
    now = bridge.runtime.clock.now_utc().isoformat()
    state = {
        "state": value,
        "attributes": {"device_ts": device_time.isoformat()} if device_time else {},
        "last_changed": now,
        "last_updated": now,
        "last_reported": now,
    }
    return bridge.observation(config.bindings[0], state, kind, {"time_fired": now}, config)


@pytest.mark.parametrize("tolerance,skew,delay", [(1, 0.8, 0.3), (60, 45, 10)])
@pytest.mark.parametrize("kind", ["live_change", "report", "snapshot"])
async def test_later_ha_unavailable_replaces_device_measurement(
    runtime, config, tolerance, skew, delay, kind
):
    config["sources"][0]["freshness"]["future_tolerance_s"] = tolerance
    config["bindings"][0]["adapter"]["ha_time_attribute"] = "device_ts"
    await activate(runtime, config)
    bridge = BridgeAdapter(runtime, None, "ws://unused", "test")
    good = ha_observation(
        bridge, "on", device_time=runtime.clock.now_utc() + timedelta(seconds=skew)
    )
    await runtime.submit("observation", good)
    assert field(runtime)["status"] == "valid"
    assert field(runtime)["measured_at"] == good.model_dump(mode="json")["device_time"]
    runtime.clock.advance(delay)
    unavailable = ha_observation(bridge, "unavailable", kind=kind)
    assert unavailable.device_time is None
    await runtime.submit(
        "snapshot" if kind == "snapshot" else "observation",
        [unavailable] if kind == "snapshot" else unavailable,
    )
    assert field(runtime)["status"] == "unknown"
    assert field(runtime)["value"] is None
    assert {reason["code"] for reason in field(runtime)["reasons"]} == {"input_unavailable"}
    assert runtime.state.tables["source_observation_current"]["binding.a"] == (
        unavailable.model_dump(mode="json")
    )


@pytest.mark.parametrize("kind", ["live_change", "report", "snapshot"])
async def test_new_device_observation_after_ha_unavailable_is_accepted(runtime, config, kind):
    config["bindings"][0]["adapter"]["ha_time_attribute"] = "device_ts"
    await activate(runtime, config)
    bridge = BridgeAdapter(runtime, None, "ws://unused", "test")
    unavailable = ha_observation(bridge, "unavailable")
    await runtime.submit("observation", unavailable)
    assert field(runtime)["status"] == "unknown"
    runtime.clock.advance(0.3)
    fresh = ha_observation(
        bridge, "on", device_time=runtime.clock.now_utc() - timedelta(seconds=0.8), kind=kind
    )
    # The device clock lags HA; its new measurement is numerically below the old HA time.
    assert fresh.device_time < unavailable.ha_time_fired
    await runtime.submit(
        "snapshot" if kind == "snapshot" else "observation",
        [fresh] if kind == "snapshot" else fresh,
    )
    assert field(runtime)["status"] == "valid"
    assert field(runtime)["value"] == "on"
    assert field(runtime)["measured_at"] == fresh.model_dump(mode="json")["device_time"]
    assert runtime.state.tables["source_observation_current"]["binding.a"] == (
        fresh.model_dump(mode="json")
    )


@pytest.mark.parametrize("recovery", [False, True], ids=["overflow-drain", "db-recovery"])
async def test_buffered_ha_unavailable_replaces_device_measurement(runtime, config, recovery):
    config["bindings"][0]["adapter"]["ha_time_attribute"] = "device_ts"
    await activate(runtime, config)
    bridge = BridgeAdapter(runtime, None, "ws://unused", "test")
    await runtime.submit(
        "observation",
        ha_observation(bridge, "on", device_time=runtime.clock.now_utc() + timedelta(seconds=0.8)),
    )
    runtime.clock.advance(0.3)
    unavailable = ha_observation(bridge, "unavailable")
    runtime.latest["binding.a"] = unavailable
    runtime.overflow = True
    await runtime.submit("recover" if recovery else "validate", None if recovery else config)
    stored = runtime.state.tables["source_observation_current"]["binding.a"]
    assert stored["availability"] == "unavailable"
    assert stored["device_time"] is None
    assert stored["ha_time_fired"] == unavailable.model_dump(mode="json")["ha_time_fired"]
    assert field(runtime)["status"] == "unknown"
    assert {reason["code"] for reason in field(runtime)["reasons"]} == {"input_unavailable"}
    assert not runtime.latest


@pytest.mark.parametrize("clock", ["device", "ha"])
@pytest.mark.parametrize("availability", ["available", "unavailable"])
async def test_older_same_clock_evidence_is_still_rejected(runtime, config, clock, availability):
    await activate(runtime, config)
    now = runtime.clock.now_utc()
    newer = obs(runtime, device_time=now if clock == "device" else None)
    await runtime.submit("observation", newer)
    sequence = runtime.state.publication_seq
    history = len(await runtime.store.rows("source_observation_history"))
    runtime.clock.advance(1)
    older = obs(runtime, False, availability=availability).model_copy(
        update={
            # With two device measurements, advancing HA time must not bypass device order.
            # With one device measurement, advancing device time must not bypass HA order.
            "device_time": now - timedelta(seconds=1) if clock == "device" else now,
            "ha_time_fired": runtime.clock.now_utc()
            if clock == "device"
            else now - timedelta(seconds=1),
        }
    )
    await runtime.submit("observation", older)
    assert runtime.state.tables["source_observation_current"]["binding.a"] == (
        newer.model_dump(mode="json")
    )
    assert field(runtime)["status"] == "valid"
    assert runtime.state.publication_seq == sequence
    assert len(await runtime.store.rows("source_observation_history")) == history


@pytest.mark.parametrize("device_on", ["previous", "current"])
@pytest.mark.parametrize("delta", [0, 0.3])
def test_report_newness_uses_shared_ha_clock(runtime, device_on, delta):
    now = runtime.clock.now_utc()
    previous = obs(runtime).model_copy(
        update={
            "observation_kind": "report",
            "ha_last_reported": now,
            "device_time": now + timedelta(seconds=0.8) if device_on == "previous" else None,
        }
    )
    current = previous.model_copy(
        update={
            "ha_last_reported": now + timedelta(seconds=delta),
            "device_time": now + timedelta(seconds=0.8) if device_on == "current" else None,
            "received_at": now + timedelta(seconds=5),
            "ha_last_updated": now + timedelta(seconds=5),
        }
    )
    assert not is_older(current, previous)
    assert is_new(current, previous) is (delta > 0)


def test_duplicate_device_measurement_does_not_refresh_on_ha_report(runtime):
    now = runtime.clock.now_utc()
    previous = obs(runtime, device_time=now).model_copy(
        update={"observation_kind": "report", "ha_last_reported": now}
    )
    current = previous.model_copy(
        update={
            "ha_last_reported": now + timedelta(seconds=1),
            "received_at": now + timedelta(seconds=1),
        }
    )
    assert not is_older(current, previous)
    assert not is_new(current, previous)


@pytest.mark.parametrize("device_on", ["previous", "current"])
@pytest.mark.parametrize("change", ["none", "value", "unavailable"])
async def test_no_shared_measurement_clock_keeps_conservative_path(
    runtime, config, device_on, change
):
    await activate(runtime, config)
    now = runtime.clock.now_utc()
    device = obs(runtime, device_time=now).model_copy(update={"ha_time_fired": None})
    ha = obs(runtime).model_copy(update={"ha_time_fired": now - timedelta(seconds=0.5)})
    previous, current = (device, ha) if device_on == "previous" else (ha, device)
    await runtime.submit("observation", previous)
    current = current.model_copy(
        update={
            "value_raw": False if change == "value" else True,
            "availability": "unavailable" if change == "unavailable" else "available",
            "received_at": now + timedelta(seconds=10),
            "ha_last_updated": now + timedelta(seconds=10),
        }
    )
    assert not is_older(current, previous)
    assert is_new(current, previous) is (change != "none")
    await runtime.submit("observation", current)
    expected = previous if change == "none" else current
    assert runtime.state.tables["source_observation_current"]["binding.a"] == (
        expected.model_dump(mode="json")
    )
    assert field(runtime)["status"] == ("unknown" if change == "unavailable" else "valid")
