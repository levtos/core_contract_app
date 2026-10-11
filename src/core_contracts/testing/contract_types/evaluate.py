"""Synthetic field definitions; lifecycle/restore/deadlines are platform-owned."""

from datetime import datetime

from ...fusion import Fusion
from ...producer import Context, TemporalParameters, state_machine, temporal
from ...quality import FieldValue, ReasonCode, derive, unknown
from ...resolver import FormulaCatalog, boolean, compare, first_match, map_value
from ...statemachine import Machine
from . import (
    BooleanParameters,
    FusionParameters,
    MachineParameters,
    machine_definition,
)


def echo(ctx: Context) -> dict[str, FieldValue]:
    return {"value": ctx.input("a")}


def refresh_echo(ctx: Context) -> dict[str, FieldValue]:
    value = ctx.input("a")
    if value.usable(ctx.now):
        ctx.node["refresh_requested"] = False
    elif ctx.origin == "input" and not ctx.node.get("refresh_requested"):
        ctx.request_refresh("a")
        ctx.node["refresh_requested"] = True
    return {"value": value}


def multi(ctx: Context) -> dict[str, FieldValue]:
    return {"value": ctx.input("a"), "flag": ctx.input("b"), "label": ctx.input("c")}


def resolver(ctx: Context) -> dict[str, FieldValue]:
    p = BooleanParameters.model_validate(ctx.contract.parameters)
    a, b, now = ctx.input("a"), ctx.input("b"), ctx.now
    if p.operator in {"and", "or", "not"}:
        result = boolean(p.operator, list(ctx.inputs.values()), now)
    elif p.operator == "compare":
        result = compare(a, b, p.comparison or "", now)
    elif p.operator == "map":
        result = map_value(a, p.mapping or {}, now)
    elif p.operator == "bucket":
        result = ctx.bucket("value", a, bool(p.initial), float(p.lower or 0), float(p.upper or 0))
    elif p.operator == "first_match":
        result = first_match([(a, b), (ctx.inputs.get("c", a), ctx.inputs.get("d", b))], now)
    elif p.operator == "not_applicable":
        result = (
            FieldValue(status="not_applicable", quality="healthy", positively_not_applicable=True)
            if a.usable(now) and a.value is True
            else a
        )
    else:
        formulas = FormulaCatalog()
        formulas.register("test.sum", 1, lambda values: sum(values))
        result = formulas.evaluate("test.sum", 1, list(ctx.inputs.values()), now)
    return {"value": result}


def agreement(items: list[FieldValue], at: datetime) -> FieldValue:
    if any(not i.usable(at) for i in items):
        return unknown(ReasonCode.INPUT_UNKNOWN, "candidates", at)
    if any(i.value != items[0].value for i in items):
        return unknown(ReasonCode.CONFLICT, "candidates", at)
    return derive(items[0].value, items, at)


def fusion(ctx: Context) -> dict[str, FieldValue]:
    implementation = Fusion()
    implementation.register("test_agreement", agreement)
    return {
        "value": implementation.evaluate(
            FusionParameters.model_validate(ctx.contract.parameters).strategy,
            list(ctx.inputs.values()),
            ctx.now,
        )
    }


def timed(ctx: Context) -> dict[str, FieldValue]:
    return {"value": temporal(ctx, TemporalParameters.model_validate(ctx.contract.parameters))}


def machine(ctx: Context) -> dict[str, FieldValue]:
    return {
        "value": state_machine(
            ctx,
            Machine(
                machine_definition(
                    MachineParameters.model_validate(ctx.contract.parameters),
                    typed=ctx.contract.type_version >= 2,
                )
            ),
            reinitialize=lambda context: (
                context.origin == "input" and context.input("a").status == "valid"
            ),
        )
    }
