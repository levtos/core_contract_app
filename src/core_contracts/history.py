"""Bounded keyset pages. Cursors are opaque data, never SQL or expressions."""

import base64
import json
from datetime import UTC, datetime
from typing import Any

from pydantic import Field, field_validator, model_validator

from .model import Model, canonical, checksum, utc

HISTORY_TABLES = {
    "contracts": "contract_state_history",
    "observations": "source_observation_history",
    "transitions": "sm_transition",
    "episodes": "sm_episode",
    "deadlines": "deadline",
    "commands": "command_log",
    "gaps": "history_gap",
    "diagnostics": "diagnostic_event",
    "revisions": "registry_revision",
    "activations": "registry_activation",
}
TIME_KEYS = ("at", "published_at", "received_at", "since_at", "created_at", "updated_at")
TIME_SQL = (
    "COALESCE("
    + ",".join(f"NULLIF(payload->>'{key}','')::timestamptz" for key in TIME_KEYS)
    + ",'0001-01-01T00:00:00Z'::timestamptz)"
)
CONTRACT_SQL = "COALESCE(payload->>'contract_id',payload->'command'->>'contract_id')"


class HistoryQuery(Model):
    limit: int = Field(default=100, ge=1, le=200)
    contract_id: str | None = Field(default=None, max_length=256)
    source_id: str | None = Field(default=None, max_length=256)
    since: datetime | None = None
    until: datetime | None = None
    cursor: str | None = Field(default=None, max_length=2048)

    @field_validator("since", "until")
    @classmethod
    def timestamp(cls, value: datetime | None) -> datetime | None:
        return utc(value) if value else None

    @model_validator(mode="after")
    def ordered(self) -> HistoryQuery:
        if self.since and self.until and self.since > self.until:
            raise ValueError("invalid_history_interval")
        return self

    def scope(self, table: str) -> str:
        return checksum(
            {"table": table, **self.model_dump(mode="json", exclude={"limit", "cursor"})}
        )

    def position(self, table: str) -> tuple[datetime, str] | None:
        if self.cursor is None:
            return None
        try:
            value = json.loads(base64.urlsafe_b64decode(self.cursor.encode()))
            if (
                not isinstance(value, dict)
                or value.get("version") != 1
                or value.get("scope") != self.scope(table)
                or not isinstance(value.get("time"), str)
                or not isinstance(value.get("key"), str)
            ):
                raise ValueError("invalid_history_cursor")
            return parse_time(value["time"]), value["key"]
        except ValueError, TypeError, KeyError, UnicodeError:
            raise ValueError("invalid_history_cursor") from None


def parse_time(value: str) -> datetime:
    return utc(datetime.fromisoformat(value)) if value else datetime.min.replace(tzinfo=UTC)


def timestamp(payload: dict[str, Any]) -> datetime:
    return parse_time(next((payload[key] for key in TIME_KEYS if payload.get(key)), ""))


def page(
    records: list[tuple[str, dict[str, Any]]], query: HistoryQuery, table: str
) -> dict[str, Any]:
    items = records[: query.limit]
    cursor = None
    if len(records) > query.limit and items:
        key, payload = items[-1]
        cursor = base64.urlsafe_b64encode(
            canonical(
                {
                    "version": 1,
                    "scope": query.scope(table),
                    "key": key,
                    "time": timestamp(payload).isoformat(),
                }
            ).encode()
        ).decode()
    return {
        "items": [{"id": key, **payload} for key, payload in items],
        "next_cursor": cursor,
        "limit": query.limit,
        "order": "time_desc_key_desc",
    }
