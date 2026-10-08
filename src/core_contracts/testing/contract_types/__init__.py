"""The only registered types in Platform Alpha 1."""

from typing import Any, Literal, Self, cast

from pydantic import Field, model_validator

from ...model import Model
from ...schema import ContractType, FieldSchema, InputDeclaration, Schema, TypeRegistry
from ...statemachine import Definition, Machine, Transition


class EchoParameters(Model):
    pass


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


class TemporalParameters(Model):
    operation: Literal["stable_for", "dwell", "grace", "edge", "delta", "age"]
    duration_s: float = Field(gt=0)
    accepts_held: bool


class MachineParameters(Model):
    deadline_s: float = Field(gt=0)
    sessions: bool


def machine_definition(parameters: MachineParameters) -> Definition:
    def guard(inputs: dict[str, Any], now: Any) -> bool | None:
        value = inputs.get("a")
        return value.value is True if value and value.usable(now) else None

    return Definition(
        states=("a", "b", "c"),
        initial="a",
        commands=("request_b",),
        transitions=(
            Transition("a", "b", "request_b", guard, "test_request"),
            Transition("b", "c", "deadline", guard, "test_deadline", ends_episode=True),
            Transition("c", "a", "input", guard, "test_episode", new_episode=True),
        ),
        deadline_seconds=parameters.deadline_s,
        sessions=parameters.sessions,
    )


def type_registry() -> TypeRegistry:
    from .evaluate import FixtureEvaluation

    registry = TypeRegistry()
    for name, producer, parameters, restore in (
        ("echo", "resolver", EchoParameters, ()),
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
                evaluate=lambda clock, latches, *args: FixtureEvaluation(clock, latches).produce(
                    *args
                ),
                machine_factory=(
                    lambda parameters: Machine(
                        machine_definition(MachineParameters.model_validate(parameters))
                    )
                )
                if name == "state_machine"
                else None,
            )
        )
    return registry
