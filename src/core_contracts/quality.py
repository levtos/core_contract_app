"""Field-level quality invariants and decisive-evidence propagation."""

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal, Self

from pydantic import Field as PField
from pydantic import field_validator, model_validator

from .model import Model, utc


class ReasonCode(StrEnum):
    INPUT_UNAVAILABLE = "input_unavailable"
    INPUT_UNKNOWN = "input_unknown"
    INPUT_STALE = "input_stale"
    INPUT_RESTORED = "input_restored"
    INPUT_ABSENT = "input_absent"
    UNMAPPED_VALUE = "unmapped_value"
    INVALID_VALUE = "invalid_value"
    NO_MATCH = "no_match"
    CONFLICT = "conflict"
    PARTIAL_EVIDENCE = "partial_evidence"
    GRACE = "source_transition_grace"
    SELECTION_BLOCKED = "selection_blocked"
    DEPENDENCY_UNAVAILABLE = "dependency_unavailable"
    CONFIG_INCOMPLETE = "config_incomplete"
    EVALUATION_ERROR = "evaluation_error"
    RESTORE_MISSING = "restore_context_missing"
    RESTORE_INCOMPATIBLE = "restore_context_incompatible"
    RESTORE_STALE = "restore_context_stale"
    HISTORY_GAP = "history_gap"
    DEADLINE_OVERDUE = "deadline_overdue_unprocessed"
    GUARD_REJECTED = "guard_rejected"


class Reason(Model):
    code: ReasonCode
    input: str = PField(min_length=1)
    source_id: str | None = None
    since: datetime
    detail: str | None = None

    _utc = field_validator("since")(utc)


class FieldValue(Model):
    status: Literal["valid", "held", "unknown", "not_applicable", "unresolved"]
    value: Any = None
    quality: Literal["healthy", "degraded"]
    held_until: datetime | None = None
    since_at: datetime | None = None
    freshness: str | None = None
    reasons: tuple[Reason, ...] = ()
    evidence: tuple[str, ...] = ()
    measured_at: datetime | None = None
    grace_declared: bool = False
    positively_not_applicable: bool = False

    @field_validator("held_until", "since_at", "measured_at")
    @classmethod
    def times(cls, value: datetime | None) -> datetime | None:
        return utc(value) if value else None

    @model_validator(mode="after")
    def invariant(self) -> Self:
        if self.status in {"valid", "held"} and self.value is None:
            raise ValueError("value_required")
        if self.status in {"unknown", "unresolved", "not_applicable"} and self.value is not None:
            raise ValueError("null_required")
        if self.status in {"unknown", "unresolved"}:
            if self.quality != "degraded" or not self.reasons:
                raise ValueError("reason_and_degraded_required")
        if self.status == "held":
            if (
                not self.held_until
                or not self.grace_declared
                or not self.reasons
                or self.quality != "healthy"
            ):
                raise ValueError("declared_grace_required")
        elif self.held_until is not None:
            raise ValueError("held_until_requires_held")
        if self.status == "not_applicable" and (
            not self.positively_not_applicable or self.quality != "healthy"
        ):
            raise ValueError("positive_determination_required")
        return self

    def usable(self, now: datetime) -> bool:
        return self.status == "valid" or (
            self.status == "held" and self.held_until is not None and self.held_until > now
        )


def unknown(code: ReasonCode, input_id: str, now: datetime) -> FieldValue:
    return FieldValue(
        status="unknown",
        quality="degraded",
        reasons=(Reason(code=code, input=input_id, since=now),),
    )


def derive(value: Any, inputs: list[FieldValue], now: datetime) -> FieldValue:
    """Only decisive inputs belong here; their Grace cannot be renewed."""
    if any(not item.usable(now) for item in inputs):
        reasons = tuple(r for i in inputs for r in i.reasons)
        return FieldValue(
            status="unknown",
            quality="degraded",
            reasons=reasons or (Reason(code=ReasonCode.INPUT_UNKNOWN, input="inputs", since=now),),
        )
    ends = [i.held_until for i in inputs if i.status == "held" and i.held_until]
    times = [i.measured_at for i in inputs if i.measured_at]
    return FieldValue(
        status="held" if ends else "valid",
        value=value,
        quality="healthy" if ends or all(i.quality == "healthy" for i in inputs) else "degraded",
        held_until=min(ends) if ends else None,
        grace_declared=bool(ends),
        reasons=tuple(r for i in inputs for r in i.reasons),
        evidence=tuple(dict.fromkeys(e for i in inputs for e in i.evidence)),
        measured_at=min(times) if times else None,
    )
