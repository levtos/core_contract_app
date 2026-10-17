"""Closed calendar projections; all scheduling uses the injected Clock."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal, Self

from pydantic import Field, model_validator

from .clock import berlin_utc, berlin_zone
from .model import Model


class Season(Model):
    name: str = Field(min_length=1, max_length=64)
    start: str = Field(pattern=r"^\d{2}-\d{2}$")

    @model_validator(mode="after")
    def valid_date(self) -> Self:
        date.fromisoformat("2001-" + self.start)
        return self


class CalendarInput(Model):
    timezone: Literal["Europe/Berlin"] = "Europe/Berlin"
    projection: Literal[
        "timestamp",
        "date",
        "time",
        "weekday",
        "minute_of_day",
        "day_of_year",
        "season",
        "anniversary",
    ]
    resolution: Literal["minute", "second"] = "minute"
    seasons: tuple[Season, ...] = Field(default=(), max_length=64)
    month_day: str | None = Field(default=None, pattern=r"^\d{2}-\d{2}$")
    leap_day: Literal["skip", "feb28", "mar01"] | None = None

    @model_validator(mode="after")
    def coherent(self) -> Self:
        if self.projection == "season":
            starts = [s.start for s in self.seasons]
            if (
                not starts
                or starts != sorted(set(starts))
                or len({s.name for s in self.seasons}) != len(starts)
            ):
                raise ValueError("season_boundaries_required_and_ordered")
        elif self.seasons:
            raise ValueError("seasons_only_for_season_projection")
        if self.projection == "anniversary":
            if not self.month_day:
                raise ValueError("anniversary_date_required")
            date.fromisoformat("2000-" + self.month_day)
            if self.month_day == "02-29" and self.leap_day is None:
                raise ValueError("leap_day_strategy_required")
        elif self.month_day or self.leap_day:
            raise ValueError("anniversary_options_only_for_anniversary")
        if self.resolution == "second" and self.projection not in {"timestamp", "time"}:
            raise ValueError("second_resolution_not_applicable")
        return self


def anniversary(config: CalendarInput, year: int) -> date | None:
    assert config.month_day is not None
    try:
        return date.fromisoformat(f"{year:04d}-" + config.month_day)
    except ValueError:
        if config.leap_day == "skip":
            return None
        return date(year, 2, 28) if config.leap_day == "feb28" else date(year, 3, 1)


def project(config: CalendarInput, now: datetime) -> tuple[Any, datetime]:
    local = now.astimezone(berlin_zone())
    today = local.date()
    midnight = berlin_utc(datetime.combine(today + timedelta(days=1), time()))
    kind = config.projection
    if kind in {"timestamp", "time", "minute_of_day"}:
        seconds = 1 if config.resolution == "second" else 60
        # UTC boundaries include both occurrences of the DST double hour.
        stamp = now.astimezone(UTC).replace(microsecond=0)
        if seconds == 60:
            stamp = stamp.replace(second=0)
        value: Any = (
            stamp.isoformat()
            if kind == "timestamp"
            else local.strftime("%H:%M:%S")
            if kind == "time"
            else local.hour * 60 + local.minute
        )
        if kind == "time" and seconds == 60:
            value = local.replace(second=0).strftime("%H:%M:%S")
        return value, stamp + timedelta(seconds=seconds)
    if kind == "date":
        return today.isoformat(), midnight
    if kind == "weekday":
        return local.isoweekday(), midnight
    if kind == "day_of_year":
        return today.timetuple().tm_yday, midnight
    if kind == "season":
        key = today.strftime("%m-%d")
        current = next((s for s in reversed(config.seasons) if s.start <= key), config.seasons[-1])
        dates = [
            berlin_utc(datetime.combine(date.fromisoformat(f"{year:04d}-" + s.start), time()))
            for year in (today.year, today.year + 1)
            for s in config.seasons
        ]
        return current.name, min(at for at in dates if at > now)
    dates = [
        day for year in range(today.year, today.year + 9) if (day := anniversary(config, year))
    ]
    events = [
        berlin_utc(datetime.combine(day + timedelta(days=offset), time()))
        for day in dates
        for offset in (0, 1)
    ]
    return today in dates, min(at for at in events if at > now)
