"""Synthetic producers; the generic runtime dispatches only through registered callbacks."""

from datetime import datetime
from typing import Any

from pydantic import ValidationError

from ...clock import Clock
from ...fusion import Fusion
from ...persistence import State
from ...quality import FieldValue, ReasonCode, derive, unknown
from ...registry import Contract
from ...resolver import Bucket, FormulaCatalog, boolean, compare, first_match, map_value
from ...statemachine import Machine, MachineState
from ...temporal import Temporal, TemporalState, age, delta
from . import (
    BooleanParameters,
    FusionParameters,
    MachineParameters,
    TemporalParameters,
    machine_definition,
)


class FixtureEvaluation:
    def __init__(self, clock: Clock, latches: dict[str, Bucket]) -> None:
        self.clock = clock
        self.pending_latches = latches

    def produce(
        self,
        contract: Contract,
        inputs: dict[str, FieldValue],
        node: dict[str, Any],
        state: State,
        origin: str,
        case: str,
        override: MachineState | None,
    ) -> tuple[FieldValue, dict[str, Any], MachineState | None]:
        now = self.clock.now_utc()
        a = inputs["a"]
        b = inputs.get("b", unknown(ReasonCode.INPUT_ABSENT, "b", now))
        result = a
        machine_state = None
        if contract.type_id == "test.boolean":
            params = BooleanParameters.model_validate(contract.parameters)
            op = params.operator
            if op in {"and", "or", "not"}:
                result = boolean(op, list(inputs.values()), now)
            elif op == "compare":
                result = compare(a, b, params.comparison or "", now)
            elif op == "map":
                result = map_value(a, params.mapping or {}, now)
            elif op == "bucket":
                assert self.pending_latches is not None
                bucket = self.pending_latches.setdefault(
                    contract.contract_id,
                    Bucket(
                        bool(params.initial), float(params.lower or 0), float(params.upper or 0)
                    ),
                )
                result = bucket.evaluate(a, now)
            elif op == "first_match":
                result = first_match([(a, b), (inputs.get("c", a), inputs.get("d", b))], now)
            elif op == "not_applicable":
                result = (
                    FieldValue(
                        status="not_applicable", quality="healthy", positively_not_applicable=True
                    )
                    if a.usable(now) and a.value is True
                    else a
                )
            else:
                formulas = FormulaCatalog()
                formulas.register("test.sum", 1, lambda values: sum(values))
                result = formulas.evaluate("test.sum", 1, list(inputs.values()), now)
        elif contract.type_id == "test.fusion":
            fusion = Fusion()

            def agreement(items: list[FieldValue], at: datetime) -> FieldValue:
                if any(not i.usable(at) for i in items):
                    return unknown(ReasonCode.INPUT_UNKNOWN, "candidates", at)
                if any(i.value != items[0].value for i in items):
                    return unknown(ReasonCode.CONFLICT, "candidates", at)
                return derive(items[0].value, items, at)

            fusion.register("test_agreement", agreement)
            result = fusion.evaluate(
                FusionParameters.model_validate(contract.parameters).strategy,
                list(inputs.values()),
                now,
            )
        elif contract.type_id == "test.temporal":
            p = TemporalParameters.model_validate(contract.parameters)
            previous = (
                TemporalState.model_validate(node["temporal"])
                if "temporal" in node
                else TemporalState(fingerprint=node["fingerprint"])
            )
            temporal = Temporal(previous, p.accepts_held)
            if "restore_pending" in node and all(item.usable(now) for item in inputs.values()):
                pending = TemporalState.model_validate(node.pop("restore_pending"))
                temporal.restore(
                    pending, node["fingerprint"], now, decisive_inputs=list(inputs.values())
                )
            if origin == "restore":
                temporal.restore(
                    previous, node["fingerprint"], now, decisive_inputs=list(inputs.values())
                )
            if p.operation in {"stable_for", "dwell"}:
                result = temporal.stable_for(a, p.duration_s, now)
            elif p.operation == "grace":
                result = temporal.grace(a, p.duration_s, now, trigger=origin == "input")
            elif p.operation == "edge":
                result = temporal.edge(a, now, allow_edge=origin == "input")
            elif p.operation == "delta":
                result = delta(a, b, now)
            else:
                result = age(a, now)
            node["temporal"] = temporal.state.model_dump(mode="json")
        elif contract.type_id == "test.state_machine":
            machine = Machine(
                machine_definition(MachineParameters.model_validate(contract.parameters))
            )
            if override:
                machine_state = override
            elif "machine" in node:
                try:
                    machine_state = MachineState.model_validate(node["machine"])
                    invalid = machine.validate_restore(machine_state, node["fingerprint"], now)
                except ValidationError:
                    invalid = unknown(ReasonCode.RESTORE_MISSING, contract.contract_id, now)
                if invalid:
                    if origin == "input" and a.status == "valid":
                        machine_state = machine.initial(
                            now, state.active_revision, node["fingerprint"]
                        )
                    else:
                        return invalid, node, None
            elif case == "first" or (origin == "input" and a.status == "valid"):
                # Synthetic type's declared recovery rule: fresh decisive live
                # evidence can start a NEW episode; snapshots cannot invent one.
                machine_state = machine.initial(now, state.active_revision, node["fingerprint"])
            else:
                code = (
                    ReasonCode.RESTORE_INCOMPATIBLE
                    if case == "incompatible"
                    else ReasonCode.RESTORE_MISSING
                )
                return unknown(code, contract.contract_id, now), node, None
            assert machine_state is not None
            if not override:
                event = (
                    "deadline"
                    if machine_state.deadline and machine_state.deadline.due(now)
                    else "input"
                )
                if origin == "input" or (event == "deadline" and origin in {"timer", "restore"}):
                    machine_state, outcome = machine.step(
                        machine_state, event, inputs, now, state.active_revision
                    )
                    if event == "deadline" and outcome == "guard_unknown":
                        node["machine"] = machine_state.model_dump(mode="json")
                        return (
                            unknown(ReasonCode.DEADLINE_OVERDUE, contract.contract_id, now),
                            node,
                            machine_state,
                        )
                if origin == "restore":
                    machine_state = machine_state.model_copy(update={"origin": "restore"})
            node["machine"] = machine_state.model_dump(mode="json")
            result = FieldValue(
                status="valid",
                value=machine_state.state,
                quality="healthy",
                since_at=machine_state.since_at,
                evidence=machine_state.evidence,
            )
        return result, node, machine_state
