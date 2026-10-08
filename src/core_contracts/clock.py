"""The only wall/monotonic time and scheduling boundary."""

import asyncio
import heapq
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from importlib.resources import files
from typing import Protocol
from zoneinfo import ZoneInfo

from .model import utc


@dataclass(order=True)
class Alarm:
    at: datetime
    serial: int
    callback: Callable[[], None] = field(compare=False)
    cancelled: bool = field(default=False, compare=False)

    def cancel(self) -> None:
        self.cancelled = True


class Clock(Protocol):
    def now_utc(self) -> datetime: ...
    def monotonic(self) -> float: ...
    def call_at_utc(self, at: datetime, callback: Callable[[], None]) -> Alarm: ...
    def call_later(self, seconds: float, callback: Callable[[], None]) -> Alarm: ...
    async def sleep(self, seconds: float) -> None: ...


class SystemClock:
    def __init__(self) -> None:
        self._alarms: list[Alarm] = []
        self._serial = 0

    def now_utc(self) -> datetime:
        return datetime.now(UTC)

    def monotonic(self) -> float:
        return time.monotonic()

    def call_at_utc(self, at: datetime, callback: Callable[[], None]) -> Alarm:
        self._serial += 1
        alarm = Alarm(utc(at), self._serial, callback)
        heapq.heappush(self._alarms, alarm)
        return alarm

    def call_later(self, seconds: float, callback: Callable[[], None]) -> Alarm:
        return self.call_at_utc(self.now_utc() + timedelta(seconds=seconds), callback)

    def _fire(self) -> None:
        while self._alarms and self._alarms[0].at <= self.now_utc():
            alarm = heapq.heappop(self._alarms)
            if not alarm.cancelled:
                alarm.callback()

    async def run(self) -> None:
        # Absolute deadlines are rechecked after wall-clock jumps; popped alarms cannot refire.
        while True:
            self._fire()
            await self.sleep(0.1)

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)


class FakeClock(SystemClock):
    def __init__(self, now: datetime) -> None:
        super().__init__()
        self._now = utc(now)
        self._mono = 0.0

    def now_utc(self) -> datetime:
        return self._now

    def monotonic(self) -> float:
        return self._mono

    def advance(self, seconds: float) -> None:
        if seconds < 0:
            raise ValueError("use jump for wall-clock changes")
        self._mono += seconds
        self._now += timedelta(seconds=seconds)
        self._fire()

    def jump(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)
        self._fire()

    async def sleep(self, seconds: float) -> None:
        future = asyncio.get_running_loop().create_future()
        alarm = self.call_later(
            seconds, lambda: future.set_result(None) if not future.done() else None
        )
        try:
            await future
        finally:
            alarm.cancel()


def berlin_utc(local: datetime) -> datetime:
    """Naive civil time: fold zero; a DST gap advances to the first real second."""
    if local.tzinfo is not None:
        raise ValueError("expected local civil time")
    # Use the locked Python tzdata distribution even if the host has newer tzfiles.
    with files("tzdata.zoneinfo").joinpath("Europe/Berlin").open("rb") as data:
        zone = ZoneInfo.from_file(data, key="Europe/Berlin")
    while True:
        candidate = local.replace(tzinfo=zone, fold=0).astimezone(UTC)
        if candidate.astimezone(zone).replace(tzinfo=None) == local:
            return candidate
        local += timedelta(seconds=1)
