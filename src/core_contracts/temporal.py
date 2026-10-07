"""Serializable temporal tools; no implicit continuity across a gap."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from .model import Model
from .quality import FieldValue, Reason, ReasonCode, derive, unknown


class TemporalState(Model):
    fingerprint: str
    since_at: datetime | None = None
    grace_until: datetime | None = None
    last_valid: FieldValue | None = None
    baseline: FieldValue | None = None
    gap_at: datetime | None = None


@dataclass
class Temporal:
    state: TemporalState
    accepts_held: bool = False

    def stable_for(self, value: FieldValue, seconds: float, now: datetime) -> FieldValue:
        if not value.usable(now) or (value.status == "held" and not self.accepts_held):
            self.state = self.state.model_copy(update={"since_at": None, "gap_at": now})
            return unknown(ReasonCode.INPUT_UNKNOWN, "condition", now)
        if type(value.value) is not bool:
            return unknown(ReasonCode.INVALID_VALUE, "condition", now)
        if not value.value:
            self.state = self.state.model_copy(update={"since_at": None})
            return derive(False, [value], now)
        if self.state.since_at is None:
            self.state = self.state.model_copy(update={"since_at": now})
        assert self.state.since_at is not None
        return derive((now - self.state.since_at).total_seconds() >= seconds, [value], now)

    def dwell(self, value: FieldValue, seconds: float, now: datetime) -> FieldValue:
        return self.stable_for(value, seconds, now)

    def grace(
        self, value: FieldValue, seconds: float, now: datetime, *, trigger: bool
    ) -> FieldValue:
        if value.status == "valid":
            self.state = self.state.model_copy(update={"last_valid": value, "grace_until": None})
            return value
        if value.status == "held":
            return derive(value.value, [value], now)  # Never seed another Grace from Held.
        if self.state.grace_until is None and trigger and self.state.last_valid is not None:
            self.state = self.state.model_copy(
                update={"grace_until": now + timedelta(seconds=seconds)}
            )
        if self.state.last_valid and self.state.grace_until and now < self.state.grace_until:
            return FieldValue(
                status="held",
                value=self.state.last_valid.value,
                quality="healthy",
                held_until=self.state.grace_until,
                grace_declared=True,
                reasons=(Reason(code=ReasonCode.GRACE, input="value", since=now),),
                evidence=self.state.last_valid.evidence,
                measured_at=self.state.last_valid.measured_at,
            )
        # Keep the expired deadline: re-evaluation must not renew it.
        return value

    def edge(self, value: FieldValue, now: datetime, *, allow_edge: bool) -> FieldValue:
        previous = self.state.baseline
        if not value.usable(now):
            self.state = self.state.model_copy(update={"gap_at": now})
            return value  # Unknown never overwrites the baseline.
        self.state = self.state.model_copy(update={"baseline": value})
        return derive(bool(allow_edge and previous and previous.value != value.value), [value], now)

    def restore(
        self,
        state: TemporalState,
        fingerprint: str,
        now: datetime,
        *,
        decisive_inputs: list[FieldValue],
    ) -> None:
        if state.fingerprint != fingerprint:
            self.state = TemporalState(fingerprint=fingerprint, gap_at=now)
            return
        continuous = (
            bool(state.since_at)
            and bool(decisive_inputs)
            and all(
                i.usable(now)
                and i.since_at is not None
                and state.since_at is not None
                and i.since_at < state.since_at
                for i in decisive_inputs
            )
        )
        grace_bridges = (
            self.accepts_held
            and bool(decisive_inputs)
            and all(i.status == "held" and i.usable(now) for i in decisive_inputs)
        )
        self.state = state.model_copy(
            update={
                "since_at": state.since_at if continuous or grace_bridges else None,
                "gap_at": now,
            }
        )


def delta(current: FieldValue, previous: FieldValue, now: datetime) -> FieldValue:
    if not current.usable(now) or not previous.usable(now):
        return derive(None, [current, previous], now)
    if type(current.value) not in {int, float} or type(previous.value) not in {int, float}:
        return unknown(ReasonCode.INVALID_VALUE, "delta", now)
    return derive(current.value - previous.value, [current, previous], now)


def age(value: FieldValue, now: datetime) -> FieldValue:
    if not value.usable(now) or value.measured_at is None:
        return unknown(ReasonCode.INPUT_STALE, "age", now)
    return derive(max(0.0, (now - value.measured_at).total_seconds()), [value], now)


class Deadline(Model):
    deadline_id: str
    episode_id: str
    at: datetime
    fired: bool = False

    def due(self, now: datetime) -> bool:
        return not self.fired and self.at <= now


StartCase = Literal["first", "valid", "stale", "incompatible", "partial", "missing"]


def start_case(
    *,
    ever_active: bool,
    context: dict[str, Any] | None,
    fingerprint: str,
    stale: bool = False,
    required: set[str] | None = None,
) -> StartCase:
    if not ever_active:
        return "first"
    if context is None:
        return "missing"
    if context.get("fingerprint") != fingerprint:
        return "incompatible"
    if required and not required.issubset(context):
        return "partial"
    if stale:
        return "stale"
    return "valid"
