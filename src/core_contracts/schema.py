"""Immutable package-internal contract type registry."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from math import isfinite
from typing import Any, Literal, Self

from pydantic import BaseModel, Field, ValidationError, model_validator

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
        if self.type == "timestamp" and isinstance(value, str):
            try:
                value = datetime.fromisoformat(value)
            except ValueError:
                return False
        accepted = {
            "bool": lambda: type(value) is bool,
            "number": lambda: type(value) in {int, float} and isfinite(value),
            "enum": lambda: isinstance(value, str) and value in self.value_catalog,
            "text": lambda: isinstance(value, str),
            "timestamp": lambda: isinstance(value, datetime) and value.tzinfo is not None,
            "object": lambda: isinstance(value, (dict, list, str, bool, float, int)),
        }[self.type]()
        return accepted and (not self.value_catalog or value in self.value_catalog)


class Schema(Model):
    fields: dict[str, FieldSchema]
    available_projection: tuple[str, ...] = ()
    grace_capable: bool = False
    grace_parameter: str | None = None
    fixture: bool = True

    @model_validator(mode="after")
    def coherent(self) -> Self:
        if not self.fields or set(self.available_projection) - self.fields.keys():
            raise ValueError("invalid field projection")
        if self.grace_capable != bool(self.grace_parameter):
            raise ValueError("grace parameter declaration required")
        for declaration in self.fields.values():
            if declaration.type == "enum" and not declaration.value_catalog:
                raise ValueError("enum catalog required")
        return self


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
    evaluate: Callable[
        ..., tuple[FieldValue | dict[str, FieldValue], dict[str, Any], MachineState | None]
    ]
    machine_factory: Callable[[dict[str, Any]], Machine] | None = None
    next_due: Callable[[dict[str, Any], dict[str, Any], datetime], datetime | None] | None = None
    commands: dict[str, type[BaseModel]] = field(default_factory=dict)
    refresh_inputs: tuple[str, ...] = ()

    def description(self) -> dict[str, Any]:
        return {
            "type_id": self.type_id,
            "type_version": self.type_version,
            "schema": self.schema.model_dump(mode="json"),
            "producer": self.producer,
            "parameter_schema": self.parameters.model_json_schema(),
            "inputs": [i.model_dump() for i in self.inputs],
            "restore": self.restore,
            **(
                {
                    "commands": {
                        name: args.model_json_schema() for name, args in self.commands.items()
                    }
                }
                if self.commands
                else {}
            ),
            **({"refresh_inputs": self.refresh_inputs} if self.refresh_inputs else {}),
        }


class TypeRegistry:
    def __init__(self) -> None:
        self.types: dict[tuple[str, int], ContractType] = {}

    def register(self, contract_type: ContractType) -> None:
        key = (contract_type.type_id, contract_type.type_version)
        if key in self.types:
            raise ValueError("immutable type version")
        if contract_type.type_version < 1 or "." not in contract_type.type_id:
            raise ValueError("versioned type identity required")
        if set(contract_type.refresh_inputs) - {i.name for i in contract_type.inputs}:
            raise ValueError("unknown refresh input")
        if (
            contract_type.schema.grace_capable
            and contract_type.schema.grace_parameter not in contract_type.parameters.model_fields
        ):
            raise ValueError("grace parameter missing")
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
    schema: Schema,
    values: dict[str, FieldValue],
    now: datetime,
    inputs: dict[str, FieldValue] | None = None,
) -> dict[str, FieldValue]:
    result: dict[str, FieldValue] = {}
    for name, declaration in schema.fields.items():
        value = values.get(name, unknown(ReasonCode.CONFIG_INCOMPLETE, name, now))
        try:
            value = FieldValue.model_validate(value.model_dump())
        except ValidationError, AttributeError:
            value = unknown(ReasonCode.INVALID_VALUE, name, now)
        if value.status == "held":
            inherited = [v for v in (inputs or {}).values() if v.status == "held" and v.usable(now)]
            propagated = any(v.held_until == value.held_until for v in inherited)
            if not value.usable(now) or not (schema.grace_capable or propagated):
                value = unknown(ReasonCode.INVALID_VALUE, name, now)
        if value.usable(now) and not declaration.accepts(value.value):
            value = unknown(ReasonCode.INVALID_VALUE, name, now)
        result[name] = FieldValue.model_validate(value.model_dump())
    return result
