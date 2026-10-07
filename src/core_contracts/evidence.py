"""Observations preserve source clocks; receipt never becomes measurement."""

from datetime import datetime
from typing import Any, Literal, Self

from pydantic import Field, field_validator, model_validator

from .model import Model, utc
from .quality import FieldValue, ReasonCode, unknown


class Freshness(Model):
    mode: Literal["report_heartbeat", "liveness_source", "periodic_ttl", "event_stateful"]
    future_tolerance_s: float = Field(ge=0)
    interval_s: float | None = Field(default=None, gt=0)
    liveness_source: str | None = None

    @model_validator(mode="after")
    def required(self) -> Self:
        if self.mode != "event_stateful" and self.interval_s is None:
            raise ValueError("freshness interval required")
        if self.mode == "liveness_source" and not self.liveness_source:
            raise ValueError("liveness source required")
        return self


class Observation(Model):
    source_id: str
    binding_id: str
    adapter: Literal["ha_state", "ha_attribute", "mqtt", "scheduler", "command"]
    source_origin: str = "local"
    value_raw: Any = None
    value_normalized: Any = None
    normalized: bool = False
    device_time: datetime | None = None
    ha_last_changed: datetime | None = None
    ha_last_updated: datetime | None = None
    ha_last_reported: datetime | None = None
    ha_time_fired: datetime | None = None
    ha_context_id: str | None = None
    mqtt_retained: bool = False
    mqtt_qos: int | None = Field(default=None, ge=0, le=2)
    received_at: datetime
    observation_kind: Literal["live_change", "report", "snapshot", "restore"]
    ha_restored: bool = False
    assumed_state: bool = False
    epoch_id: str
    ingest_seq: int = Field(ge=0)
    availability: Literal["available", "unavailable", "unknown", "absent"] = "available"

    @field_validator(
        "device_time",
        "ha_last_changed",
        "ha_last_updated",
        "ha_last_reported",
        "ha_time_fired",
        "received_at",
    )
    @classmethod
    def times(cls, value: datetime | None) -> datetime | None:
        return utc(value) if value is not None else None

    @property
    def measurement(self) -> datetime | None:
        if self.device_time:
            return self.device_time
        if self.observation_kind == "report":
            return self.ha_last_reported
        if self.observation_kind == "live_change":
            return self.ha_time_fired or self.ha_last_changed
        # A snapshot can carry a source timestamp; last_updated alone proves no observation.
        return self.ha_last_reported or self.ha_last_changed

    @property
    def value(self) -> Any:
        return self.value_normalized if self.normalized else self.value_raw

    @property
    def reference(self) -> str:
        return f"{self.epoch_id}:{self.ingest_seq}:{self.binding_id}"


def is_new(current: Observation, previous: Observation | None) -> bool:
    if current.ha_restored or current.mqtt_retained or current.observation_kind == "restore":
        return False
    stamp = current.measurement
    if previous is None:
        return stamp is not None
    if current.availability != previous.availability:
        return True
    if stamp is None:
        return False
    old_stamp = previous.measurement
    if old_stamp and stamp < old_stamp:
        return False
    if current.observation_kind == "live_change" and current.value != previous.value:
        return True
    return old_stamp is None or stamp > old_stamp


def assess(
    observation: Observation | None,
    policy: Freshness,
    now: datetime,
    source_id: str,
    liveness: Observation | None = None,
) -> FieldValue:
    if observation is None:
        return unknown(ReasonCode.INPUT_ABSENT, source_id, now)
    code: ReasonCode | None = None
    if observation.availability != "available":
        code = {
            "absent": ReasonCode.INPUT_ABSENT,
            "unavailable": ReasonCode.INPUT_UNAVAILABLE,
            "unknown": ReasonCode.INPUT_UNKNOWN,
        }[observation.availability]
    elif observation.ha_restored or observation.observation_kind == "restore":
        code = ReasonCode.INPUT_RESTORED
    elif observation.assumed_state:
        code = ReasonCode.INPUT_UNKNOWN
    elif observation.mqtt_retained or observation.measurement is None:
        code = ReasonCode.INPUT_STALE
    elif (observation.measurement - now).total_seconds() > policy.future_tolerance_s:
        code = ReasonCode.INVALID_VALUE
    elif policy.mode == "liveness_source":
        if (
            liveness is None
            or liveness.measurement is None
            or liveness.ha_restored
            or liveness.mqtt_retained
            or liveness.availability != "available"
            or (liveness.measurement - now).total_seconds() > policy.future_tolerance_s
            or (now - liveness.measurement).total_seconds() > (policy.interval_s or 0)
        ):
            code = ReasonCode.DEPENDENCY_UNAVAILABLE
    elif policy.mode != "event_stateful" and (now - observation.measurement).total_seconds() > (
        policy.interval_s or 0
    ):
        code = ReasonCode.INPUT_STALE
    if code:
        result = unknown(code, source_id, now)
        return result.model_copy(
            update={"evidence": (observation.reference,), "freshness": "invalid"}
        )
    if observation.value is None:
        return unknown(ReasonCode.INVALID_VALUE, source_id, now)
    return FieldValue(
        status="valid",
        value=observation.value,
        quality="healthy",
        measured_at=observation.measurement,
        evidence=(observation.reference,),
        freshness="fresh",
        since_at=observation.ha_last_changed,
    )
