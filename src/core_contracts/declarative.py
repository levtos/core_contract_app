"""Type-check and adapt declarative data to the existing Producer lifecycle."""

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, create_model, model_validator

from . import declarative_models as dm
from .engines import FORMULA_SCHEMAS, FORMULAS, FUSION, FUSION_INPUTS
from .model import Model
from .producer import Context, Producer, TemporalParameters, next_machine_due, next_temporal_due
from .producer import state_machine as evaluate_machine
from .producer import temporal as evaluate_temporal
from .quality import FieldValue, ReasonCode, unknown
from .resolver import Bucket, boolean, compare, first_match, map_value
from .schema import ContractType, FieldSchema, InputDeclaration
from .statemachine import Definition, Guard, Machine, Transition


class EmptyParameters(Model):
    """Definition versions contain semantic parameters; instances bind inputs."""


class RuleValidationError(ValueError):
    def __init__(self, code: str, path: str) -> None:
        self.path = path
        super().__init__(code)


class DefinitionValidationErrors(ValueError):
    def __init__(self, issues: list[RuleValidationError]) -> None:
        self.issues = issues
        super().__init__(str(issues[0]))


def rule_children(rule: dm.Rule) -> list[tuple[str, dm.Rule]]:
    if isinstance(rule, dm.CompareRule):
        return [("left", rule.left), ("right", rule.right)]
    if isinstance(rule, (dm.MapRule, dm.BucketRule, dm.NotApplicableRule)):
        return [("arg", rule.arg)]
    if isinstance(rule, dm.FirstMatchRule):
        return [
            (f"cases/{index}/{name}", child)
            for index, case in enumerate(rule.cases)
            for name, child in (("when", case.when), ("then", case.then))
        ]
    if isinstance(rule, (dm.BooleanRule, dm.FormulaRule, dm.FusionRule, dm.TemporalRule)):
        return [(f"args/{index}", child) for index, child in enumerate(rule.args)]
    return []


def scalar(kind: Literal["bool", "number", "text", "enum"]) -> FieldSchema:
    return FieldSchema(type=kind, required=True, physical_state=False)


def compatible(actual: FieldSchema, expected: FieldSchema) -> bool:
    return (
        (actual.type == expected.type or (actual.type == "enum" and expected.type == "text"))
        and (
            not expected.value_catalog
            or (
                bool(actual.value_catalog)
                and set(actual.value_catalog) <= set(expected.value_catalog)
            )
        )
        and (expected.unit is None or actual.unit == expected.unit)
    )


def joined(schemas: list[FieldSchema]) -> FieldSchema:
    first = schemas[0]
    if len({s.unit for s in schemas}) > 1:
        raise ValueError("unit_mismatch")
    kinds = {s.type for s in schemas}
    if kinds <= {"enum", "text"} and "text" in kinds:
        return scalar("text").model_copy(update={"unit": first.unit})
    if len(kinds) != 1:
        raise ValueError("rule_type_mismatch")
    if first.type == "enum":
        return first.model_copy(
            update={"value_catalog": tuple(sorted({v for s in schemas for v in s.value_catalog}))}
        )
    return first


def children(rule: dm.Rule) -> tuple[dm.Rule, ...]:
    return tuple(child for _, child in rule_children(rule))


def all_rules(definition: dm.DeclarativeDefinition) -> list[dm.Rule]:
    roots = [*definition.rules.values(), *definition.outputs.values()]
    if definition.machine:
        roots += [t.guard for t in definition.machine.transitions]
        roots.append(definition.machine.reinitialize_when)
    result: list[dm.Rule] = []

    def visit(rule: dm.Rule, depth: int) -> None:
        if depth > dm.MAX_DEPTH or len(result) >= dm.MAX_NODES:
            raise ValueError("definition_resource_limit")
        result.append(rule)
        for child in children(rule):
            visit(child, depth + 1)

    for root in roots:
        visit(root, 1)
    return result


def check_definition(definition: dm.DeclarativeDefinition) -> None:
    rules = all_rules(definition)
    paths: dict[int, str] = {}

    def locate(rule: dm.Rule, path: str) -> None:
        paths[id(rule)] = path
        for suffix, child in rule_children(rule):
            locate(child, path + "/" + suffix)

    for group in ("rules", "outputs"):
        for name, rule in getattr(definition, group).items():
            locate(rule, f"/{group}/{name}")
    if definition.machine:
        locate(definition.machine.reinitialize_when, "/machine/reinitialize_when")
        for index, transition in enumerate(definition.machine.transitions):
            locate(transition.guard, f"/machine/transitions/{index}/guard")
    identifiers = [r.id for r in rules if isinstance(r, (dm.BucketRule, dm.TemporalRule))]
    if definition.machine:
        identifiers.append(definition.machine.id)
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("duplicate_stateful_id")
    inputs = {item.name: item.field_schema for item in definition.inputs}
    visiting: set[str] = set()
    resolved: dict[tuple[str, bool], FieldSchema] = {}
    depths: dict[str, int] = {}

    def expanded_depth(rule: dm.Rule, active: frozenset[str] = frozenset()) -> int:
        if isinstance(rule, dm.ReferenceRule):
            if rule.name in active:
                raise ValueError("internal_cycle")
            if rule.name not in definition.rules:
                raise ValueError("unknown_internal_reference")
            if rule.name not in depths:
                depths[rule.name] = expanded_depth(
                    definition.rules[rule.name], active | {rule.name}
                )
            return 1 + depths[rule.name]
        return 1 + max((expanded_depth(child, active) for child in children(rule)), default=0)

    if any(expanded_depth(rule) > dm.MAX_DEPTH for rule in rules):
        raise ValueError("definition_resource_limit")

    def require(actual: FieldSchema, expected: FieldSchema) -> FieldSchema:
        if not compatible(actual, expected):
            raise ValueError("rule_type_mismatch")
        return actual

    def infer(rule: dm.Rule, *, guard: bool = False, depth: int = 0) -> FieldSchema:
        try:
            return infer_rule(rule, guard=guard, depth=depth)
        except RuleValidationError:
            raise
        except ValueError as error:
            raise RuleValidationError(str(error), paths.get(id(rule), "/rules")) from None

    def infer_rule(rule: dm.Rule, *, guard: bool = False, depth: int = 0) -> FieldSchema:
        if depth > dm.MAX_DEPTH:
            raise ValueError("definition_resource_limit")
        if guard and isinstance(rule, (dm.MachineRule, dm.TemporalRule, dm.BucketRule)):
            raise ValueError("stateful_guard_requires_contract_input")
        if isinstance(rule, dm.InputRule):
            if rule.name not in inputs:
                raise ValueError("unknown_rule_input")
            return inputs[rule.name]
        if isinstance(rule, dm.ReferenceRule):
            if rule.name not in definition.rules:
                raise ValueError("unknown_internal_reference")
            if rule.name in visiting:
                raise ValueError("internal_cycle")
            key = (rule.name, guard)
            if key not in resolved:
                visiting.add(rule.name)
                try:
                    resolved[key] = infer(definition.rules[rule.name], guard=guard, depth=depth + 1)
                finally:
                    visiting.remove(rule.name)
            return resolved[key]
        if isinstance(rule, dm.LiteralRule):
            return rule.field_schema
        args = [infer(child, guard=guard, depth=depth + 1) for child in children(rule)]
        if isinstance(rule, dm.BooleanRule):
            for arg in args:
                require(arg, scalar("bool"))
            return scalar("bool")
        if isinstance(rule, dm.NotApplicableRule):
            require(args[0], scalar("bool"))
            return scalar("bool")
        if isinstance(rule, dm.CompareRule):
            if not (compatible(args[0], args[1]) or compatible(args[1], args[0])):
                raise ValueError("comparison_type_mismatch")
            if rule.comparison not in {"eq", "ne"} and args[0].type not in {
                "number",
                "text",
                "timestamp",
            }:
                raise ValueError("unordered_comparison")
            return scalar("bool")
        if isinstance(rule, dm.MapRule):
            if args[0].type == "object":
                raise ValueError("map_requires_scalar")
            return rule.field_schema
        if isinstance(rule, dm.FirstMatchRule):
            for arg in args[::2]:
                require(arg, scalar("bool"))
            return joined(args[1::2])
        if isinstance(rule, dm.BucketRule):
            require(args[0], scalar("number"))
            return scalar("bool")
        if isinstance(rule, dm.FormulaRule):
            if (rule.name, rule.version) not in FORMULA_SCHEMAS:
                raise ValueError("unknown_formula_version")
            declaration = FORMULA_SCHEMAS[rule.name, rule.version]
            for arg in args:
                require(arg, declaration.input)
            units = {arg.unit for arg in args}
            if len(units) != 1:
                raise ValueError("unit_mismatch")
            return declaration.output.model_copy(update={"unit": args[0].unit})
        if isinstance(rule, dm.FusionRule):
            if rule.strategy not in FUSION_INPUTS:
                raise ValueError("unknown_fusion_strategy")
            kind = FUSION_INPUTS[rule.strategy]
            expected = (
                FieldSchema.model_validate(
                    {"type": kind, "required": True, "physical_state": False}
                )
                if kind
                else joined(args)
            )
            for arg in args:
                require(arg, expected)
            return expected
        if isinstance(rule, dm.TemporalRule):
            if rule.operation in {"stable_for", "dwell", "edge"}:
                require(args[0], scalar("bool"))
                return scalar("bool")
            if rule.operation == "delta":
                for arg in args:
                    require(arg, scalar("number"))
                return scalar("number")
            return scalar("number") if rule.operation == "age" else args[0]
        assert isinstance(rule, dm.MachineRule)
        if not definition.machine:
            raise ValueError("machine_definition_required")
        return scalar("enum").model_copy(update={"value_catalog": definition.machine.states})

    issues: list[RuleValidationError] = []

    def check(rule: dm.Rule, expected: FieldSchema | None = None, *, guard: bool = False) -> None:
        try:
            actual = infer(rule, guard=guard)
            if expected and not compatible(actual, expected):
                raise RuleValidationError("rule_type_mismatch", paths.get(id(rule), "/rules"))
        except RuleValidationError as error:
            if not any((str(item), item.path) == (str(error), error.path) for item in issues):
                issues.append(error)

    for rule in definition.rules.values():
        check(rule)
    for name, rule in definition.outputs.items():
        check(rule, definition.output_schema.fields[name])
    if definition.machine:
        for rule in [definition.machine.reinitialize_when] + [
            t.guard for t in definition.machine.transitions
        ]:
            check(rule, scalar("bool"), guard=True)
    if issues:
        raise DefinitionValidationErrors(issues)


class Evaluation:
    """One bounded invocation; named rules and stateful nodes evaluate once."""

    def __init__(
        self,
        definition: dm.DeclarativeDefinition,
        inputs: dict[str, FieldValue],
        now: datetime,
        context: Context | None = None,
    ) -> None:
        self.definition, self.inputs, self.now, self.context = definition, inputs, now, context
        self.inputs = dict(inputs)
        for declaration in definition.inputs:
            value = self.inputs.get(declaration.name)
            if value and value.usable(now) and not declaration.field_schema.accepts(value.value):
                self.inputs[declaration.name] = unknown(
                    ReasonCode.INVALID_VALUE, declaration.name, now
                )
        self.memo: dict[str, FieldValue] = {}
        self.trace: list[dict[str, Any]] = []
        self.cost = 0

    def evaluate(self, rule: dm.Rule) -> FieldValue:
        self.cost += 1
        if self.cost > dm.MAX_NODES * 2:
            raise ValueError("evaluation_resource_limit")
        result = self._evaluate(rule)
        if any(reason.code == ReasonCode.EVALUATION_ERROR for reason in result.reasons):
            raise ValueError("declarative_evaluation_failed")
        # No raw values, attributes, parameters or command arguments in traces.
        self.trace.append(
            {
                "op": rule.op,
                "id": getattr(rule, "id", None),
                "status": result.status,
                "quality": result.quality,
                "reasons": [reason.code.value for reason in result.reasons],
                "evidence": list(result.evidence[:64]),
                "decision": result.value if type(result.value) is bool else None,
                **({"strategy": rule.strategy} if isinstance(rule, dm.FusionRule) else {}),
            }
        )
        return result

    def _evaluate(self, rule: dm.Rule) -> FieldValue:
        now = self.now
        if isinstance(rule, dm.InputRule):
            return self.inputs.get(rule.name, unknown(ReasonCode.INPUT_ABSENT, rule.name, now))
        if isinstance(rule, dm.ReferenceRule):
            if rule.name not in self.memo:
                self.memo[rule.name] = self.evaluate(self.definition.rules[rule.name])
            return self.memo[rule.name]
        if isinstance(rule, dm.LiteralRule):
            return FieldValue(status="valid", value=rule.value, quality="healthy")
        if isinstance(rule, dm.MachineRule):
            if "$machine" not in self.memo:
                assert self.context is not None and self.definition.machine is not None
                reinitialize_rule = self.definition.machine.reinitialize_when
                if self.context.override is not None:
                    previous = self.context.node.get("machine", {}).get("state")
                    for transition in self.definition.machine.transitions:
                        if (
                            transition.source == previous
                            and transition.event == self.context.override.trigger
                        ):
                            guard = self.evaluate(transition.guard)
                            self.trace.append(
                                {
                                    "op": "guard",
                                    "source": previous,
                                    "target": transition.target,
                                    "event": transition.event,
                                    "decision": guard.value if guard.usable(now) else None,
                                }
                            )
                            break
                self.memo["$machine"] = evaluate_machine(
                    self.context,
                    compile_machine(self.definition, evaluation=self),
                    reinitialize=lambda ctx: (
                        ctx.origin == "input" and self.evaluate(reinitialize_rule).value is True
                    ),
                )
            return self.memo["$machine"]
        args = [self.evaluate(child) for child in children(rule)]
        if isinstance(rule, dm.BooleanRule):
            return boolean(rule.op, args, now)
        if isinstance(rule, dm.NotApplicableRule):
            return (
                FieldValue(
                    status="not_applicable",
                    quality="healthy",
                    positively_not_applicable=True,
                    evidence=args[0].evidence,
                )
                if args[0].usable(now) and args[0].value is True
                else args[0]
            )
        if isinstance(rule, dm.CompareRule):
            return compare(args[0], args[1], rule.comparison, now)
        if isinstance(rule, dm.MapRule):
            return map_value(args[0], rule.entries, now)
        if isinstance(rule, dm.FirstMatchRule):
            return first_match(list(zip(args[::2], args[1::2], strict=True)), now)
        if isinstance(rule, dm.FormulaRule):
            return FORMULAS.evaluate(rule.name, rule.version, args, now)
        if isinstance(rule, dm.FusionRule):
            return FUSION.evaluate(rule.strategy, args, now)
        assert self.context is not None
        if isinstance(rule, dm.BucketRule):
            key = f"{self.context.contract.contract_id}:{rule.id}"
            node = self.context.node.setdefault("rules", {}).setdefault(rule.id, {})
            bucket = self.context.latches.setdefault(
                key, Bucket(rule.initial, rule.lower, rule.upper, node.get("latch"))
            )
            result = bucket.evaluate(args[0], now)
            node["latch"] = bucket.latch
            return result
        assert isinstance(rule, dm.TemporalRule)
        node = self.context.node.setdefault("rules", {}).setdefault(
            rule.id, {"fingerprint": self.context.node["fingerprint"]}
        )
        context = replace(self.context, node=node, inputs=dict(zip(("a", "b"), args, strict=False)))
        return evaluate_temporal(context, temporal_parameters(rule))


def temporal_parameters(rule: dm.TemporalRule) -> TemporalParameters:
    return TemporalParameters(
        operation=rule.operation, duration_s=rule.duration_s, accepts_held=rule.accepts_held
    )


def compile_machine(
    definition: dm.DeclarativeDefinition, *, evaluation: Evaluation | None = None
) -> Machine:
    machine = definition.machine
    assert machine is not None

    def guard(rule: dm.Rule) -> Guard:
        def evaluate(inputs: dict[str, FieldValue], now: datetime) -> bool | None:
            value = (evaluation or Evaluation(definition, inputs, now)).evaluate(rule)
            if evaluation:
                evaluation.trace.append(
                    {
                        "op": "guard",
                        "decision": value.value if value.usable(now) else None,
                    }
                )
            return value.value is True if value.usable(now) else None

        return evaluate

    def argument_guard(expected: dict[str, Any]) -> Callable[[dict[str, Any]], bool]:
        return lambda args: all(args.get(name) == value for name, value in expected.items())

    return Machine(
        Definition(
            states=machine.states,
            initial=machine.initial,
            commands=tuple(machine.commands),
            deadline_seconds=machine.deadline_s,
            sessions=machine.sessions,
            transitions=tuple(
                Transition(
                    source=t.source,
                    target=t.target,
                    event=t.event,
                    guard=guard(t.guard),
                    reason=t.reason,
                    new_episode=t.new_episode,
                    ends_episode=t.ends_episode,
                    argument_guard=argument_guard(t.argument_equals) if t.argument_equals else None,
                )
                for t in machine.transitions
            ),
        )
    )


def command_model(name: str, command: dm.CommandDefinition) -> type[BaseModel]:
    class Arguments(EmptyParameters):
        @model_validator(mode="after")
        def validate_values(self) -> Arguments:
            for key, value in self.model_dump().items():
                if key in self.model_fields_set and not command.arguments[key].accepts(value):
                    raise ValueError("command_argument_type_mismatch")
            return self

    fields: dict[str, Any] = {}
    for key, schema in command.arguments.items():
        annotation: Any = {
            "bool": bool,
            "number": float,
            "text": str,
            "timestamp": str,
            "object": dict[str, Any] | list[Any],
            "enum": str,
        }[schema.type]
        if schema.value_catalog:
            annotation = Literal[tuple(schema.value_catalog)]
        fields[key] = (
            annotation,
            Field(
                default=... if schema.required else None,
                description=f"Unit: {schema.unit or 'none'}",
            ),
        )
    return create_model(name, __base__=Arguments, **fields)


def compile_definition(definition: dm.DeclarativeDefinition) -> ContractType:
    check_definition(definition)
    temporal_rules = [r for r in all_rules(definition) if isinstance(r, dm.TemporalRule)]

    def evaluate(ctx: Context) -> dict[str, FieldValue]:
        for name in definition.refresh_inputs:
            requested = ctx.node.setdefault("refresh", {})
            if ctx.input(name).usable(ctx.now):
                requested[name] = False
            elif ctx.origin == "input" and not requested.get(name):
                ctx.request_refresh(name)
                requested[name] = True
        evaluation = Evaluation(definition, ctx.inputs, ctx.now, ctx)
        values = {name: evaluation.evaluate(rule) for name, rule in definition.outputs.items()}
        ctx.node["trace"] = {
            "at": ctx.now.isoformat(),
            "registry_revision": ctx.state.active_revision,
            "epoch_id": ctx.state.epoch_id,
            "origin": ctx.origin,
            "steps": evaluation.trace,
            "cost": evaluation.cost,
        }
        return values

    def next_due(
        parameters: dict[str, Any], node: dict[str, Any], now: datetime
    ) -> datetime | None:
        due = [
            next_temporal_due(
                temporal_parameters(rule).model_dump(), node.get("rules", {}).get(rule.id, {}), now
            )
            for rule in temporal_rules
        ]
        due.append(next_machine_due(parameters, node, now))
        return min((at for at in due if at is not None and at > now), default=None)

    return ContractType(
        type_id=definition.type_id,
        type_version=definition.type_version,
        schema=definition.output_schema,
        producer="state_machine" if definition.machine else "resolver",
        parameters=EmptyParameters,
        inputs=tuple(
            InputDeclaration(name=i.name, required=i.field_schema.required)
            for i in definition.inputs
        ),
        restore=("rules", "machine") if definition.machine else ("rules",),
        evaluate=Producer(evaluate),
        next_due=next_due,
        machine_factory=(lambda _: compile_machine(definition)) if definition.machine else None,
        commands={
            name: command_model(name, command)
            for name, command in definition.machine.commands.items()
        }
        if definition.machine
        else {},
        definition=definition.model_dump(mode="json"),
        refresh_inputs=definition.refresh_inputs,
        grace_outputs=tuple(definition.outputs)
        if any(r.operation == "grace" for r in temporal_rules)
        else (),
    )
