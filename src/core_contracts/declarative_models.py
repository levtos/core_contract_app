"""Closed, versioned data language for the existing producer engines.

No expression strings are interpreted. The discriminated union is also the
public editor schema; runtime and import use precisely the same models.
"""

from typing import Annotated, Any, Literal, Self

from pydantic import ConfigDict, Field, model_validator

from .model import Model
from .schema import FieldSchema, Schema

MAX_NODES = 256
MAX_DEPTH = 16
MAX_INPUTS = 64
MAX_FIELDS = 32
MAX_DEFINITIONS = 128
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")]


class DeclarativeModel(Model):
    model_config = ConfigDict(serialize_by_alias=True)


class TypedInput(DeclarativeModel):
    name: Identifier
    field_schema: FieldSchema = Field(alias="schema")

    @model_validator(mode="after")
    def complete(self) -> Self:
        if self.field_schema.type == "enum" and not self.field_schema.value_catalog:
            raise ValueError("enum_catalog_required")
        return self


class InputRule(Model):
    op: Literal["input"]
    name: Identifier


class ReferenceRule(Model):
    op: Literal["ref"]
    name: Identifier


class LiteralRule(DeclarativeModel):
    op: Literal["literal"]
    field_schema: FieldSchema = Field(alias="schema")
    value: Any

    @model_validator(mode="after")
    def typed(self) -> Self:
        if not self.field_schema.accepts(self.value):
            raise ValueError("literal_type_mismatch")
        return self


class BooleanRule(Model):
    op: Literal["and", "or", "not"]
    args: tuple[Rule, ...] = Field(min_length=1, max_length=MAX_INPUTS)

    @model_validator(mode="after")
    def arity(self) -> Self:
        if self.op == "not" and len(self.args) != 1:
            raise ValueError("not_requires_one_argument")
        return self


class CompareRule(Model):
    op: Literal["compare"]
    comparison: Literal["eq", "ne", "lt", "le", "gt", "ge"]
    left: Rule
    right: Rule


class MapRule(DeclarativeModel):
    op: Literal["map"]
    arg: Rule
    field_schema: FieldSchema = Field(alias="schema")
    entries: dict[str, Any] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def typed(self) -> Self:
        if any(not self.field_schema.accepts(value) for value in self.entries.values()):
            raise ValueError("map_type_mismatch")
        return self


class Case(Model):
    when: Rule
    then: Rule


class FirstMatchRule(Model):
    op: Literal["first_match"]
    cases: tuple[Case, ...] = Field(min_length=1, max_length=MAX_INPUTS)


class BucketRule(Model):
    op: Literal["bucket"]
    id: Identifier
    arg: Rule
    initial: bool
    lower: float
    upper: float

    @model_validator(mode="after")
    def bounds(self) -> Self:
        if self.lower > self.upper:
            raise ValueError("invalid_hysteresis_bounds")
        return self


class FormulaRule(Model):
    op: Literal["formula"]
    name: str
    version: int = Field(ge=1)
    args: tuple[Rule, ...] = Field(min_length=1, max_length=MAX_INPUTS)


class FusionRule(Model):
    op: Literal["fusion"]
    strategy: str = Field(min_length=1, max_length=128)
    args: tuple[Rule, ...] = Field(min_length=1, max_length=MAX_INPUTS)


class TemporalRule(Model):
    op: Literal["temporal"]
    id: Identifier
    operation: Literal["stable_for", "dwell", "grace", "edge", "delta", "age"]
    args: tuple[Rule, ...] = Field(min_length=1, max_length=2)
    duration_s: float = Field(gt=0, le=31_536_000)
    accepts_held: bool = False

    @model_validator(mode="after")
    def arity(self) -> Self:
        if len(self.args) != (2 if self.operation == "delta" else 1):
            raise ValueError("temporal_argument_count")
        return self


class MachineRule(Model):
    op: Literal["machine"]


class NotApplicableRule(Model):
    op: Literal["not_applicable"]
    arg: Rule


Rule = Annotated[
    InputRule
    | ReferenceRule
    | LiteralRule
    | BooleanRule
    | CompareRule
    | MapRule
    | FirstMatchRule
    | BucketRule
    | FormulaRule
    | FusionRule
    | TemporalRule
    | MachineRule
    | NotApplicableRule,
    Field(discriminator="op"),
]


class CommandDefinition(Model):
    arguments: dict[Identifier, FieldSchema] = Field(default_factory=dict, max_length=MAX_INPUTS)

    @model_validator(mode="after")
    def complete(self) -> Self:
        if any(s.type == "enum" and not s.value_catalog for s in self.arguments.values()):
            raise ValueError("enum_catalog_required")
        return self


class TransitionDefinition(Model):
    source: Identifier
    target: Identifier
    event: str = Field(min_length=1, max_length=64)
    guard: Rule
    reason: str = Field(min_length=1, max_length=128)
    new_episode: bool = False
    ends_episode: bool = False
    # Equality requirements on typed command arguments; no expression language.
    argument_equals: dict[str, Any] = Field(default_factory=dict, max_length=MAX_INPUTS)


class MachineDefinition(Model):
    id: Identifier
    states: tuple[Identifier, ...] = Field(min_length=1, max_length=64)
    initial: Identifier
    transitions: tuple[TransitionDefinition, ...] = Field(max_length=128)
    commands: dict[Identifier, CommandDefinition] = Field(default_factory=dict, max_length=32)
    deadline_s: float | None = Field(default=None, gt=0, le=31_536_000)
    sessions: bool = False
    reinitialize_when: Rule
    # Omit the additive false default so released definition fingerprints stay stable.
    allow_manual_restart: bool = Field(
        default=False, strict=True, exclude_if=lambda value: not value
    )

    @model_validator(mode="after")
    def coherent(self) -> Self:
        if len(set(self.states)) != len(self.states) or self.initial not in self.states:
            raise ValueError("invalid_machine_states")
        if {"input", "deadline"} & self.commands.keys():
            raise ValueError("reserved_machine_event")
        for declared_command in self.commands.values():
            if any(
                name.startswith("model_") or hasattr(Model, name)
                for name in declared_command.arguments
            ):
                raise ValueError("reserved_command_argument")
        for transition in self.transitions:
            if transition.source not in self.states or transition.target not in self.states:
                raise ValueError("invalid_transition_state")
            if transition.event not in {"input", "deadline", *self.commands}:
                raise ValueError("unknown_transition_event")
            if transition.event == "deadline" and self.deadline_s is None:
                raise ValueError("transition_deadline_required")
            command = self.commands.get(transition.event)
            for name, value in transition.argument_equals.items():
                if not command or name not in command.arguments:
                    raise ValueError("unknown_command_argument")
                if not command.arguments[name].accepts(value):
                    raise ValueError("command_argument_type_mismatch")
        return self


class DeclarativeDefinition(DeclarativeModel):
    type_id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z0-9_.-]+$", max_length=128)
    type_version: int = Field(ge=1)
    language_version: Literal[1] = 1
    display_name: str = ""
    description: str = ""
    inputs: tuple[TypedInput, ...] = Field(default=(), max_length=MAX_INPUTS)
    refresh_inputs: tuple[Identifier, ...] = Field(default=(), max_length=MAX_INPUTS)
    output_schema: Schema = Field(alias="schema")
    rules: dict[Identifier, Rule] = Field(default_factory=dict, max_length=MAX_NODES)
    outputs: dict[Identifier, Rule] = Field(min_length=1, max_length=MAX_FIELDS)
    machine: MachineDefinition | None = None

    @model_validator(mode="after")
    def coherent(self) -> Self:
        if len({item.name for item in self.inputs}) != len(self.inputs):
            raise ValueError("duplicate_input")
        if set(self.refresh_inputs) - {item.name for item in self.inputs}:
            raise ValueError("unknown_refresh_input")
        if self.outputs.keys() != self.output_schema.fields.keys():
            raise ValueError("output_schema_mismatch")
        if self.output_schema.grace_capable:
            raise ValueError("declarative_grace_uses_rule_duration")
        return self


for _model in (
    BooleanRule,
    CompareRule,
    MapRule,
    Case,
    FirstMatchRule,
    BucketRule,
    FormulaRule,
    FusionRule,
    TemporalRule,
    TransitionDefinition,
    MachineDefinition,
    NotApplicableRule,
    DeclarativeDefinition,
):
    _model.model_rebuild()
