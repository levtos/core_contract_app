"""Issue #3: focused pre-install delta regressions, with no production services."""

import asyncio
import copy
from datetime import timedelta
from uuid import uuid4

import aiohttp
import pytest

from core_contracts.adapters.mqtt import MQTTAdapter
from core_contracts.api import API
from core_contracts.persistence import MemoryStore
from core_contracts.runtime import Runtime
from core_contracts.security import Tokens

from .conftest import activate
from .test_remediation import field, temporal
from .test_runtime import obs

NEGATIVE_FLAGS = [
    {"availability": "unavailable"},
    {"availability": "unknown"},
    {"availability": "absent"},
    {"ha_restored": True},
    {"mqtt_retained": True},
    {"assumed_state": True},
    {"invalid_timestamp": True},
]


async def test_age_does_not_change_on_another_contract_timer_or_clock_jump(runtime, config):
    temporal(config, "age")
    other = copy.deepcopy(config["contracts"][0])
    other.update(contract_id="fixture.due")
    other["parameters"]["operation"] = "stable_for"
    other["parameters"]["duration_s"] = 1
    config["contracts"].append(other)
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    original = copy.deepcopy(runtime.snapshot()["contracts"]["fixture.echo"])
    sequence = runtime.state.publication_seq
    runtime.clock.advance(1)
    await runtime.submit("tick")
    assert runtime.snapshot()["contracts"]["fixture.due"]["fields"]["value"]["value"] is True
    assert runtime.state.publication_seq == sequence + 1
    assert runtime.snapshot()["contracts"]["fixture.echo"] == original
    runtime.clock.jump(-0.5)
    await runtime.submit("tick")
    assert runtime.snapshot()["contracts"]["fixture.echo"] == original
    sequence = runtime.state.publication_seq  # stable_for can cross its boundary backwards.
    runtime.clock.advance(10)
    await runtime.submit(
        "observation",
        obs(runtime).model_copy(
            update={"ha_time_fired": runtime.clock.now_utc() - timedelta(seconds=2)}
        ),
    )
    assert field(runtime)["value"] == 2
    assert runtime.state.publication_seq == sequence + 1


async def test_age_still_publishes_freshness_expiry_and_new_reports(runtime, config):
    temporal(config, "age")
    config["sources"][0]["freshness"] = {
        "mode": "report_heartbeat",
        "future_tolerance_s": 1,
        "interval_s": 2,
    }
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    assert field(runtime)["status"] == "valid"
    sequence = runtime.state.publication_seq
    runtime.clock.advance(2)
    await runtime.submit("tick")
    assert runtime.state.publication_seq == sequence
    runtime.clock.advance(0.5)
    await runtime.submit("tick")
    assert field(runtime)["status"] == "unknown"
    assert runtime.state.publication_seq == sequence + 1
    for _ in range(10):
        runtime.clock.advance(1)
        await runtime.submit("tick")
    assert runtime.state.publication_seq == sequence + 1
    await runtime.submit(
        "observation",
        obs(runtime).model_copy(
            update={"observation_kind": "report", "ha_last_reported": runtime.clock.now_utc()}
        ),
    )
    assert field(runtime)["status"] == "valid"
    assert field(runtime)["value"] == 0
    assert runtime.state.publication_seq == sequence + 2


async def test_age_sample_is_rebuilt_after_restore_and_fingerprint_change(runtime, config):
    temporal(config, "age")
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    await runtime.stop()
    restarted = Runtime(runtime.store, runtime.clock, runtime.types)
    await restarted.start()
    try:
        assert field(restarted)["status"] == "unknown"
        assert "age_input" not in restarted.state.tables["node_state"]["fixture.echo"]
        restarted.clock.advance(10)
        fresh = obs(restarted).model_copy(
            update={
                "observation_kind": "snapshot",
                "ha_time_fired": restarted.clock.now_utc() - timedelta(seconds=3),
            }
        )
        await restarted.submit("snapshot", [fresh])
        assert field(restarted)["value"] == 3
        restarted.clock.advance(5)
        await restarted.submit("tick")
        assert field(restarted)["value"] == 3
        config["contracts"][0]["parameters"]["duration_s"] += 1
        await activate(restarted, config)
        assert field(restarted)["value"] == 8
        restarted.clock.advance(5)
        await restarted.submit("tick")
        assert field(restarted)["value"] == 8
    finally:
        await restarted.stop()


@pytest.mark.parametrize("operation", ["edge", "grace"])
async def test_temporal_boundary_is_published_once_then_idle(runtime, config, operation):
    temporal(config, operation, duration=2)
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    runtime.clock.advance(1)
    await runtime.submit(
        "observation",
        obs(runtime, False) if operation == "edge" else obs(runtime, availability="unavailable"),
    )
    assert field(runtime)["value"] is True
    assert field(runtime)["status"] == ("valid" if operation == "edge" else "held")
    sequence = runtime.state.publication_seq
    runtime.clock.advance(2)
    await runtime.submit("tick")
    assert runtime.state.publication_seq == sequence + 1
    assert field(runtime)["value"] is (False if operation == "edge" else None)
    history = len(runtime.store.state.tables["contract_state_history"])
    for _ in range(1200):
        runtime.clock.advance(0.5)
        await runtime.submit("tick")
    assert runtime.state.publication_seq == sequence + 1
    assert len(runtime.store.state.tables["contract_state_history"]) == history


@pytest.mark.parametrize("flags", NEGATIVE_FLAGS)
@pytest.mark.parametrize("queued_kind", ["observation", "snapshot"])
async def test_queuefull_older_negative_cannot_replace_newer_positive(
    runtime, config, flags, queued_kind
):
    other = Runtime(MemoryStore(), runtime.clock, runtime.types, queue_size=1)
    await other.start()
    try:
        await activate(other, config)
        await other.submit("observation", obs(other))
        other.clock.advance(1)
        older = obs(other, **flags)
        other.clock.advance(1)
        newer = obs(other)
        if queued_kind == "snapshot":
            other.ingest_snapshot([older.model_copy(update={"observation_kind": "snapshot"})])
        else:
            other.ingest(older)
        other.ingest(newer)  # Real QueueFull; drain applies this before older.
        assert other.queue.full() and other.overflow
        assert other.latest["binding.a"] is newer
        await other.queue.join()
        stored = other.state.tables["source_observation_current"]["binding.a"]
        assert stored == newer.model_copy(update={"observation_kind": "snapshot"}).model_dump(
            mode="json"
        )
        assert field(other)["status"] == "valid"
        assert not other.latest and not other.overflow
        gaps = await other.store.rows("history_gap")
        assert [gap["reason"] for gap in gaps] == ["ingest_overflow"]
        assert len(await other.store.rows("source_observation_history")) == 1
    finally:
        await other.stop()


@pytest.mark.parametrize("recovery", [False, True], ids=["overflow-drain", "db-recovery"])
async def test_buffered_stale_negative_cannot_replace_stored_newer_measurement(
    runtime, config, recovery
):
    await activate(runtime, config)
    older = obs(runtime, availability="unavailable")
    runtime.clock.advance(2)
    newer = obs(runtime)
    await runtime.submit("observation", newer)
    runtime.latest["binding.a"] = older
    runtime.overflow = True
    await runtime.submit("recover" if recovery else "validate", None if recovery else config)
    stored = runtime.state.tables["source_observation_current"]["binding.a"]
    assert stored["ha_time_fired"] == newer.model_dump(mode="json")["ha_time_fired"]
    assert stored["availability"] == "available"
    assert not runtime.latest
    # DB recovery still marks stored evidence as restored until a fresh snapshot.
    assert field(runtime)["status"] == ("unknown" if recovery else "valid")


@pytest.mark.parametrize("flags", NEGATIVE_FLAGS)
@pytest.mark.parametrize("offset", [None, 0, 1], ids=["missing-time", "same-time", "newer"])
async def test_negative_evidence_is_still_accepted_without_an_older_measurement(
    runtime, config, flags, offset
):
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    if offset is not None:
        runtime.clock.advance(offset)
    negative = obs(runtime, **flags)
    if offset is None:
        negative = negative.model_copy(update={"ha_time_fired": None})
    await runtime.submit("observation", negative)
    assert field(runtime)["status"] == "unknown"
    assert runtime.state.tables["source_observation_current"]["binding.a"] == negative.model_dump(
        mode="json"
    )
    runtime.clock.advance(1)
    await runtime.submit("observation", obs(runtime))
    assert field(runtime)["status"] == "valid"


async def test_queuefull_newer_negative_is_not_replaced_by_older_positive(runtime, config):
    other = Runtime(MemoryStore(), runtime.clock, runtime.types, queue_size=1)
    await other.start()
    try:
        await activate(other, config)
        older = obs(other)
        other.clock.advance(1)
        newer = obs(other, availability="unavailable")
        other.ingest(older)
        other.ingest(newer)
        assert other.overflow
        await other.queue.join()
        assert field(other)["status"] == "unknown"
        assert other.state.tables["source_observation_current"]["binding.a"] == newer.model_copy(
            update={"observation_kind": "snapshot"}
        ).model_dump(mode="json")
    finally:
        await other.stop()


async def test_mqtt_status_commit_failure_is_contained_by_processor(runtime, config):
    config["bindings"][0]["adapter"] = {"kind": "mqtt", "mqtt_topic": "test/a"}
    await activate(runtime, config)
    await runtime.submit("mqtt_state", "connected")
    sequence = runtime.state.publication_seq
    runtime.store.available = False
    await runtime.submit("mqtt_state", "disconnected")
    assert runtime.mqtt == "disconnected" and runtime.live
    assert not runtime.persistence and not runtime.confirmed
    assert runtime.state.publication_seq == sequence
    runtime.store.available = True
    await runtime.submit("recover")
    assert runtime.persistence and runtime.confirmed


async def test_mqtt_disconnect_commit_failure_keeps_taskgroup_live_and_recovers(
    runtime, config, aiohttp_client, tmp_path, monkeypatch
):
    config["bindings"][0]["adapter"] = {"kind": "mqtt", "mqtt_topic": "test/a"}
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime).model_copy(update={"adapter": "mqtt"}))
    await runtime.submit("snapshot_complete")
    await runtime.submit("mqtt_state", "connected")
    before = copy.deepcopy(runtime.snapshot())
    history = len(runtime.store.state.tables["contract_state_history"])
    publications = len(runtime.store.state.publications)
    subscriber = runtime.subscribe()
    api = API(runtime, Tokens(tmp_path), str(uuid4()))
    client = await aiohttp_client(api.application())
    delays = asyncio.Queue()
    release_retry = asyncio.Event()

    async def pause(delay):
        delays.put_nowait(delay)
        await release_retry.wait()
        release_retry.clear()

    async def broker_down():
        raise OSError("injected broker disconnect")

    monkeypatch.setattr(runtime.clock, "sleep", pause)
    runtime.store.available = False  # No preceding DB probe: exact D3 race.
    async with aiohttp.ClientSession() as session, asyncio.TaskGroup() as group:
        adapter = MQTTAdapter(runtime, session, "external", {}, "")
        monkeypatch.setattr(adapter, "credentials", broker_down)
        task = group.create_task(adapter.run())
        try:
            assert await asyncio.wait_for(delays.get(), 2) == 1
            assert not task.done() and runtime.live
            assert (await client.get("/health/live")).status == 200
            assert (await client.get("/health/ready")).status == 503
            assert runtime.mqtt == "disconnected"
            assert not runtime.persistence and not runtime.confirmed
            assert runtime.snapshot()["contracts"] == before["contracts"]
            assert runtime.state.publication_seq == before["publication_seq"]
            assert len(runtime.store.state.tables["contract_state_history"]) == history
            assert len(runtime.store.state.publications) == publications
            events = [subscriber.get_nowait() for _ in range(subscriber.qsize())]
            assert all(event["type"] == "service_state" for event in events)
            assert events[-1]["publication_confirmed"] is False
            release_retry.set()
            assert await asyncio.wait_for(delays.get(), 2) == 2
            assert not task.done()
            runtime.store.available = True
            await runtime.submit("recover")
            assert runtime.persistence and runtime.confirmed and runtime.live
            assert runtime.state.epoch_id != before["epoch_id"]
            assert any(g["reason"] == "db_outage" for g in await runtime.store.rows("history_gap"))
            assert not runtime.ready  # Recovery still requires a fresh snapshot.
            await runtime.submit(
                "snapshot",
                [
                    obs(runtime).model_copy(
                        update={"adapter": "mqtt", "observation_kind": "snapshot"}
                    )
                ],
            )
            assert runtime.ready and field(runtime)["status"] == "valid"
            assert (await client.get("/health/live")).status == 200
            assert (await client.get("/health/ready")).status == 200
            assert not task.done()
        finally:
            runtime.store.available = True
            task.cancel()


async def test_mqtt_error_reporting_failure_still_backs_off(runtime, config, monkeypatch):
    await activate(runtime, config)
    entered_retry = asyncio.Event()
    attempts = []

    async def unavailable_credentials():
        raise OSError("broker down")

    async def unavailable_processor(operation, payload):
        attempts.append((operation, payload))
        raise RuntimeError("injected submit failure")

    async def pause(delay):
        assert delay == 1
        entered_retry.set()
        await asyncio.Future()

    monkeypatch.setattr(runtime, "submit", unavailable_processor)
    monkeypatch.setattr(runtime.clock, "sleep", pause)
    async with aiohttp.ClientSession() as session, asyncio.TaskGroup() as group:
        adapter = MQTTAdapter(runtime, session, "external", {}, "")
        monkeypatch.setattr(adapter, "credentials", unavailable_credentials)
        task = group.create_task(adapter.run())
        try:
            await asyncio.wait_for(entered_retry.wait(), 2)
            assert attempts == [("mqtt_state", "disconnected")]
            assert not task.done()
        finally:
            task.cancel()
