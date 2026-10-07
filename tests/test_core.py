from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from core_contracts.clock import FakeClock, berlin_utc
from core_contracts.evidence import Freshness, Observation, assess, is_new
from core_contracts.fusion import Fusion
from core_contracts.model import semantic_fingerprint
from core_contracts.quality import FieldValue, Reason, ReasonCode, derive, unknown
from core_contracts.resolver import Bucket, boolean, first_match, map_value
from core_contracts.temporal import Temporal, TemporalState, start_case

NOW = datetime(2026, 1, 1, 12, tzinfo=UTC)


def valid(value=True, **kwargs):
    return FieldValue(status="valid", value=value, quality="healthy", **kwargs)


def held(seconds=10):
    return FieldValue(
        status="held",
        value=True,
        quality="healthy",
        held_until=NOW + timedelta(seconds=seconds),
        grace_declared=True,
        reasons=(Reason(code=ReasonCode.GRACE, input="a", since=NOW),),
    )


@pytest.mark.parametrize(
    "payload",
    [
        dict(status="unknown", quality="degraded"),
        dict(status="held", value=True, quality="healthy"),
        dict(status="not_applicable", quality="healthy"),
        dict(status="valid", quality="healthy"),
        dict(status="unknown", value=False, quality="degraded"),
    ],
)
def test_quality_invariants(payload):
    with pytest.raises(ValidationError):
        FieldValue(**payload)


def test_held_propagation():
    result = derive(True, [held(10), held(5)], NOW)
    assert result.held_until == NOW + timedelta(seconds=5)
    assert derive(True, [result], NOW + timedelta(seconds=6)).status == "unknown"


@pytest.mark.parametrize(
    "a,b,op,expected",
    [
        (True, None, "or", True),
        (False, None, "and", False),
        (True, None, "and", None),
        (False, None, "or", None),
        (True, False, "and", False),
    ],
)
def test_three_values(a, b, op, expected):
    inputs = [
        valid(v) if v is not None else unknown(ReasonCode.INPUT_UNKNOWN, "b", NOW) for v in (a, b)
    ]
    assert boolean(op, inputs, NOW).value == expected


def test_strict_selection_and_map_and_bucket():
    bad = unknown(ReasonCode.INPUT_UNKNOWN, "first", NOW)
    assert first_match([(bad, valid("a")), (valid(True), valid("b"))], NOW).status == "unresolved"
    assert map_value(valid("x"), {}, NOW).reasons[0].code == "unmapped_value"
    bucket = Bucket(initial=False, lower=3, upper=5)
    assert bucket.evaluate(valid(6), NOW).value is True
    assert bucket.evaluate(valid(4), NOW).value is True
    assert bucket.evaluate(bad, NOW).status == "unknown"
    assert bucket.evaluate(valid(4), NOW).value is False


def test_stable_gap_example():
    temporal = Temporal(TemporalState(fingerprint="x"))
    assert not temporal.stable_for(valid(), 10, NOW).value
    temporal.stable_for(unknown(ReasonCode.INPUT_UNKNOWN, "a", NOW), 10, NOW + timedelta(seconds=5))
    assert not temporal.stable_for(valid(), 10, NOW + timedelta(seconds=8)).value
    assert not temporal.stable_for(valid(), 10, NOW + timedelta(seconds=17)).value
    assert temporal.stable_for(valid(), 10, NOW + timedelta(seconds=18)).value


def test_grace_cannot_renew_and_edge_survives_unknown():
    temporal = Temporal(TemporalState(fingerprint="x"))
    temporal.grace(valid(), 5, NOW, trigger=True)
    bad = unknown(ReasonCode.INPUT_UNKNOWN, "a", NOW)
    first = temporal.grace(bad, 5, NOW, trigger=True)
    assert (
        temporal.grace(bad, 5, NOW + timedelta(seconds=4), trigger=True).held_until
        == first.held_until
    )
    assert temporal.grace(bad, 5, NOW + timedelta(seconds=6), trigger=True).status == "unknown"
    temporal.edge(valid(False), NOW, allow_edge=True)
    temporal.edge(bad, NOW, allow_edge=True)
    assert temporal.edge(valid(True), NOW, allow_edge=True).value


def observation(**kwargs):
    return Observation(
        source_id="source.a",
        binding_id="binding.a",
        adapter="ha_state",
        value_raw=True,
        received_at=NOW,
        epoch_id="epoch",
        ingest_seq=1,
        **kwargs,
    )


@pytest.mark.parametrize(
    "mode", ["report_heartbeat", "periodic_ttl", "event_stateful", "liveness_source"]
)
def test_freshness_modes(mode):
    policy = Freshness(mode=mode, future_tolerance_s=1, interval_s=10, liveness_source="source.b")
    obs = observation(observation_kind="report", ha_last_reported=NOW - timedelta(seconds=20))
    fresh = observation(observation_kind="report", ha_last_reported=NOW)
    result = assess(obs, policy, NOW, "source.a", fresh)
    assert result.status == (
        "valid" if mode in {"event_stateful", "liveness_source"} else "unknown"
    )


@pytest.mark.parametrize(
    "flags", [{"mqtt_retained": True}, {"ha_restored": True}, {"assumed_state": True}, {}]
)
def test_hard_gates(flags):
    obs = observation(observation_kind="snapshot", **flags)
    assert (
        assess(obs, Freshness(mode="event_stateful", future_tolerance_s=0), NOW, "source.a").status
        == "unknown"
    )


def test_receipt_and_updated_do_not_refresh():
    old = observation(observation_kind="snapshot", ha_last_changed=NOW)
    newer = old.model_copy(
        update={
            "received_at": NOW + timedelta(seconds=30),
            "ha_last_updated": NOW + timedelta(seconds=30),
        }
    )
    assert not is_new(newer, old)
    assert is_new(
        old.model_copy(
            update={"observation_kind": "report", "ha_last_reported": NOW + timedelta(seconds=1)}
        ),
        old,
    )


def test_fusion_conflict_and_partial():
    fusion = Fusion()
    assert (
        fusion.evaluate("latest", [valid(1, measured_at=NOW), valid(2, measured_at=NOW)], NOW)
        .reasons[0]
        .code
        == "conflict"
    )
    result = fusion.evaluate(
        "first_healthy", [valid(), unknown(ReasonCode.INPUT_ABSENT, "b", NOW)], NOW
    )
    assert result.status == "valid" and result.quality == "degraded"


def test_clock_jumps_and_dst():
    clock = FakeClock(NOW)
    fired = []
    clock.call_later(5, lambda: fired.append(1))
    clock.jump(6)
    clock.jump(-10)
    clock.advance(20)
    assert fired == [1]
    assert berlin_utc(datetime(2026, 3, 29, 2, 30)) == datetime(2026, 3, 29, 1, tzinfo=UTC)
    assert berlin_utc(datetime(2026, 10, 25, 2, 30)) == datetime(2026, 10, 25, 0, 30, tzinfo=UTC)


@pytest.mark.parametrize(
    "ever,context,stale,expected",
    [
        (False, None, False, "first"),
        (True, None, False, "missing"),
        (True, {"fingerprint": "x", "value": 1}, False, "valid"),
        (True, {"fingerprint": "y"}, False, "incompatible"),
        (True, {"fingerprint": "x"}, False, "partial"),
        (True, {"fingerprint": "x", "value": 1}, True, "stale"),
    ],
)
def test_restore_start_cases(ever, context, stale, expected):
    assert (
        start_case(
            ever_active=ever, context=context, fingerprint="x", stale=stale, required={"value"}
        )
        == expected
    )


def test_fingerprint_ignores_display():
    assert semantic_fingerprint({"display_name": "a", "x": 1}) == semantic_fingerprint(
        {"display_name": "b", "x": 1}
    )
