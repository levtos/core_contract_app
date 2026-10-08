"""Immutable package-internal contract type registry."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .model import Model
from .quality import FieldValue, ReasonCode, unknown
from .statemachine import Machine, MachineState


class FieldSchema(Model):
    type: Literal["bool", "number", "enum", "text", "timestamp", "object"]
    required: bool
    physical_state: bool
    value_catalog: tuple[str, ...] = ()
    unit: str | None = None

    def accepts(self, value: Any) -> bool:
        return {
            "bool": lambda: type(value) is bool,
            "number": lambda: type(value) in {int, float},
            "enum": lambda: isinstance(value, str) and value in self.value_catalog,
            "text": lambda: isinstance(value, str),
            "timestamp": lambda: isinstance(value, datetime) and value.tzinfo is not None,
            "object": lambda: isinstance(value, (dict, list, str, bool, float, int)),
        }[self.type]()


class Schema(Model):
    fields: dict[str, FieldSchema]
    available_projection: tuple[str, ...] = ()
    grace_capable: bool = False
    grace_parameter: str | None = None
    fixture: bool = True


class InputDeclaration(Model):
    name: str
    required: bool


@dataclass(frozen=True)
class ContractType:
    type_id: str
    type_version: int
    schema: Schema
    producer: Literal["resolver", "fusion", "state_machine"]
    parameters: type[BaseModel]
    inputs: tuple[InputDeclaration, ...]
    restore: tuple[str, ...]
    evaluate: Callable[..., tuple[FieldValue, dict[str, Any], MachineState | None]]
    machine_factory: Callable[[dict[str, Any]], Machine] | None = None
    next_due: Callable[[dict[str, Any], dict[str, Any], datetime], datetime | None] | None = None

    def description(self) -> dict[str, Any]:
        return {
            "type_id": self.type_id,
            "type_version": self.type_version,
            "schema": self.schema.model_dump(mode="json"),
            "producer": self.producer,
            "parameter_schema": self.parameters.model_json_schema(),
            "inputs": [i.model_dump() for i in self.inputs],
            "restore": self.restore,
        }


class TypeRegistry:
    def __init__(self) -> None:
        self.types: dict[tuple[str, int], ContractType] = {}

    def register(self, contract_type: ContractType) -> None:
        key = (contract_type.type_id, contract_type.type_version)
        if key in self.types:
            raise ValueError("immutable type version")
        if not contract_type.schema.fixture or not contract_type.type_id.startswith("test."):
            raise ValueError("phase_1_fixture_required")
        self.types[key] = contract_type

    def get(self, type_id: str, version: int) -> ContractType:
        return self.types[type_id, version]


class Envelope(Model):
    contract_id: str
    type: dict[str, str | int]
    enabled: bool = True
    contract_health: Literal["healthy", "degraded"]
    fields: dict[str, FieldValue]
    available: bool
    state_machine: dict[str, Any] | None = None
    computed_at: datetime
    published_at: datetime
    publication_seq: int = Field(ge=1)
    registry_revision: int
    epoch_id: str
    fixture: bool = True


def validate_fields(
    schema: Schema, values: dict[str, FieldValue], now: datetime
) -> dict[str, FieldValue]:
    result: dict[str, FieldValue] = {}
    for name, declaration in schema.fields.items():
        value = values.get(name, unknown(ReasonCode.CONFIG_INCOMPLETE, name, now))
        if value.usable(now) and not declaration.accepts(value.value):
            value = unknown(ReasonCode.INVALID_VALUE, name, now)
        result[name] = FieldValue.model_validate(value.model_dump())
    return result
