"""Strict, finite JSON boundaries and canonical serialization."""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timezone_required")
    return value.astimezone(UTC)


def canonical(value: Any) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json")
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def checksum(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def semantic_fingerprint(value: Any) -> str:
    def semantic(item: Any) -> Any:
        if isinstance(item, dict):
            return {
                k: semantic(v)
                for k, v in item.items()
                if k not in {"display_name", "description", "installation_label"}
            }
        if isinstance(item, list):
            return [semantic(v) for v in item]
        return item

    return checksum(semantic(value))
