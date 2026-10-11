"""The only registered types in Platform Alpha 1."""

from dataclasses import replace
from typing import Any, Literal, Self, cast

from pydantic import Field, model_validator

from ...model import Model
from ...producer import Producer, TemporalParameters, next_machine_due, next_temporal_due
from ...schema import ContractType, FieldSchema, InputDeclaration, Schema, TypeRegistry
from ...statemachine import Definition, Machine, Transition


class EchoParameters(Model):
    pass


class RequestArguments(Model):
    confirm: bool


class BooleanParameters(Model):
    operator: Literal[
        "and", "or", "not", "compare", "map", "bucket", "first_match", "not_applicable", "formula"
    ]
    comparison: Literal["eq", "ne", "lt", "le", "gt", "ge"] | None = None
    mapping: dict[str, Any] | None = None
    lower: float | None = None
    upper: float | None = None
    initial: bool | None = None

    @model_validator(mode="after")
    def complete(self) -> Self:
        if self.operator == "compare" and self.comparison is None:
            raise ValueError("comparison required")
        if self.operator == "map" and self.mapping is None:
            raise ValueError("mapping required")
        if self.operator == "bucket" and (
            self.initial is None
            or self.lower is None
            or self.upper is None
            or self.lower > self.upper
        ):
            raise ValueError("initial and ordered bounds required")
        return self


class FusionParameters(Model):
    strategy: Literal["first_healthy", "latest", "any_true", "all_true", "test_agreement"]


class MachineParameters(Model):
    deadline_s: float = Field(gt=0)
    sessions: bool


def machine_definition(parameters: MachineParameters, *, typed: bool = False) -> Definition:
    def guard(inputs: dict[str, Any], now: Any) -> bool | None:
        value = inputs.get("a")
        return value.value is True if value and value.usable(now) else None

    typed_transitions = (
        (
            Transition(
                "a",
                "b",
                "request_b_if",
                guard,
                "test_request",
                argument_guard=lambda args: args["confirm"] is True,
            ),
        )
        if typed
        else ()
    )
    return Definition(
        states=("a", "b", "c"),
        initial="a",
        commands=("request_b", "request_b_if") if typed else ("request_b",),
        transitions=(
            Transition("a", "b", "request_b", guard, "test_request"),
            Transition("b", "c", "deadline", guard, "test_deadline", ends_episode=True),
            Transition("c", "a", "input", guard, "test_episode", new_episode=True),
        )
        + typed_transitions,
        deadline_seconds=parameters.deadline_s,
        sessions=parameters.sessions,
    )


def type_registry() -> TypeRegistry:
    from .evaluate import echo, fusion, machine, multi, refresh_echo, resolver, timed

    registry = TypeRegistry()
    evaluators = {
        "echo": echo,
        "boolean": resolver,
        "fusion": fusion,
        "temporal": timed,
        "state_machine": machine,
        "multi": multi,
    }
    for name, producer, parameters, restore in (
        ("echo", "resolver", EchoParameters, ()),
        ("multi", "resolver", EchoParameters, ()),
        ("boolean", "resolver", BooleanParameters, ("baseline",)),
        ("fusion", "fusion", FusionParameters, ()),
        ("temporal", "resolver", TemporalParameters, ("temporal",)),
        ("state_machine", "state_machine", MachineParameters, ("state", "episode", "deadline")),
    ):
        schema = Schema(
            fields={"value": FieldSchema(type="object", required=True, physical_state=False)},
            available_projection=("value",),
            grace_capable=name == "temporal",
            grace_parameter="duration_s" if name == "temporal" else None,
        )
        if name == "multi":
            schema = Schema(
                fields={
                    "value": FieldSchema(type="number", required=True, physical_state=True),
                    "flag": FieldSchema(type="bool", required=True, physical_state=False),
                    "label": FieldSchema(
                        type="enum", required=False, physical_state=False, value_catalog=("a", "b")
                    ),
                },
                available_projection=("value", "flag"),
            )
        registry.register(
            ContractType(
                type_id=f"test.{name}",
                type_version=1,
                schema=schema,
                producer=cast(Literal["resolver", "fusion", "state_machine"], producer),
                parameters=parameters,
                inputs=tuple(
                    InputDeclaration(name=key, required=key == "a") for key in ("a", "b", "c", "d")
                ),
                restore=restore,
                evaluate=Producer(evaluators[name]),
                machine_factory=(
                    lambda parameters: Machine(
                        machine_definition(MachineParameters.model_validate(parameters))
                    )
                )
                if name == "state_machine"
                else None,
                next_due=next_temporal_due
                if name == "temporal"
                else next_machine_due
                if name == "state_machine"
                else None,
            )
        )
    registry.register(
        replace(
            registry.get("test.state_machine", 1),
            type_version=2,
            commands={"request_b": EchoParameters, "request_b_if": RequestArguments},
            machine_factory=lambda parameters: Machine(
                machine_definition(MachineParameters.model_validate(parameters), typed=True)
            ),
        )
    )
    registry.register(
        replace(
            registry.get("test.echo", 1),
            type_version=2,
            evaluate=Producer(refresh_echo),
            refresh_inputs=("a",),
        )
    )
    return registry
