"""Composable fusion with a package-internal strategy extension point."""

from collections.abc import Callable
from datetime import datetime

from .quality import FieldValue, Reason, ReasonCode, derive, unknown
from .resolver import boolean

Strategy = Callable[[list[FieldValue], datetime], FieldValue]


class Fusion:
    def __init__(self) -> None:
        self.strategies: dict[str, Strategy] = {}

    def register(self, name: str, strategy: Strategy) -> None:
        if name in self.strategies or name in {"first_healthy", "latest", "any_true", "all_true"}:
            raise ValueError("duplicate strategy")
        self.strategies[name] = strategy

    def evaluate(self, strategy: str, candidates: list[FieldValue], now: datetime) -> FieldValue:
        usable = [c for c in candidates if c.usable(now)]
        if strategy in self.strategies:
            return self.strategies[strategy](candidates, now)
        if strategy in {"any_true", "all_true"}:
            result = boolean("or" if strategy == "any_true" else "and", candidates, now)
        elif not usable:
            return unknown(ReasonCode.INPUT_UNKNOWN, "candidates", now)
        elif strategy == "first_healthy":
            chosen = next((c for c in usable if c.quality == "healthy"), usable[0])
            result = derive(chosen.value, [chosen], now)
        elif strategy == "latest":
            timed = [c for c in usable if c.measured_at is not None]
            if not timed:
                return unknown(ReasonCode.INPUT_STALE, "candidates", now)
            stamp = max(c.measured_at for c in timed if c.measured_at)
            decisive = [c for c in timed if c.measured_at == stamp]
            if any(c.value != decisive[0].value for c in decisive):
                return unknown(ReasonCode.CONFLICT, "candidates", now)
            result = derive(decisive[0].value, decisive, now)
        else:
            return unknown(ReasonCode.CONFIG_INCOMPLETE, "strategy", now)
        if len(usable) < len(candidates) and result.status == "valid":
            return result.model_copy(
                update={
                    "quality": "degraded",
                    "reasons": result.reasons
                    + (Reason(code=ReasonCode.PARTIAL_EVIDENCE, input="candidates", since=now),),
                }
            )
        return result
