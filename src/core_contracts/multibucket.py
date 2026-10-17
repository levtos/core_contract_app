"""Volatile ordered classification with independent hysteresis per boundary."""

from datetime import datetime
from math import isfinite
from typing import Any

from .quality import FieldValue, ReasonCode, derive, unknown
from .resolver import Bucket


class MultiBucket(Bucket):
    def __init__(self, classes: tuple[Any, ...], initial_index: int | None) -> None:
        super().__init__(False, 0, 0)
        self.classes = classes
        self.initial_index = initial_index
        self.index = initial_index

    def classify(
        self, inputs: list[FieldValue], bands: list[tuple[int, int, int]], now: datetime
    ) -> FieldValue:
        if any(not v.usable(now) for v in inputs):
            self.index = self.initial_index
            return derive(None, inputs, now)
        if any(type(v.value) not in {int, float} or not isfinite(v.value) for v in inputs):
            self.index = self.initial_index
            return unknown(ReasonCode.INVALID_VALUE, "bucket", now)
        values = [
            (inputs[at].value, inputs[lower].value, inputs[upper].value)
            for at, lower, upper in bands
        ]
        if any(not lower <= at <= upper for at, lower, upper in values) or any(
            left[2] >= right[1] for left, right in zip(values, values[1:])
        ):
            self.index = self.initial_index
            return unknown(ReasonCode.INVALID_VALUE, "bucket.boundaries", now)
        x = inputs[0].value
        if self.index is None:
            if any(lower <= x < upper for _, lower, upper in values):
                return unknown(ReasonCode.INPUT_UNKNOWN, "bucket.initial", now)
            self.index = sum(x >= at for at, _, _ in values)
        while self.index < len(self.classes) - 1 and x >= values[self.index][2]:
            self.index += 1
        while self.index > 0 and x < values[self.index - 1][1]:
            self.index -= 1
        return derive(self.classes[self.index], inputs, now)
