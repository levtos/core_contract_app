from datetime import UTC, datetime

import pytest

from core_contracts.calendar_inputs import CalendarInput, project
from core_contracts.clock import berlin_utc
from core_contracts.declarative import Evaluation, compile_definition
from core_contracts.declarative_models import DeclarativeDefinition
from core_contracts.quality import FieldValue

from .conftest import activate
from .test_declarative import definition, registry, schema


@pytest.mark.parametrize(
    "at,minute",
    [
        ("2026-03-29T00:59:00+00:00", 119),
        ("2026-03-29T01:00:00+00:00", 180),
        ("2026-10-25T00:59:00+00:00", 179),
        ("2026-10-25T01:00:00+00:00", 120),
    ],
)
def test_minute_of_day_dst(at, minute):
    now = datetime.fromisoformat(at)
    value, due = project(CalendarInput(projection="minute_of_day"), now)
    assert value == minute and (due - now).total_seconds() == 60


def test_default_minute_and_explicit_seconds_and_year():
    now = datetime(2028, 12, 31, 12, 34, 25, tzinfo=UTC)
    assert project(CalendarInput(projection="timestamp"), now)[0] == "2028-12-31T12:34:00+00:00"
    assert (
        project(CalendarInput(projection="timestamp", resolution="second"), now)[0]
        == now.isoformat()
    )
    assert project(CalendarInput(projection="day_of_year"), now)[0] == 366
    assert project(CalendarInput(projection="date"), now)[0] == "2028-12-31"
    assert project(CalendarInput(projection="weekday"), now)[0] == 7


def test_season_anniversary_and_dst_conventions():
    now = datetime(2026, 3, 1, tzinfo=UTC)
    config = CalendarInput(
        projection="season",
        seasons=[{"name": "a", "start": "03-01"}, {"name": "b", "start": "09-01"}],
    )
    assert project(config, now)[0] == "a"
    assert project(
        CalendarInput(projection="anniversary", month_day="02-29", leap_day="mar01"), now
    )[0]
    with pytest.raises(ValueError):
        CalendarInput(projection="anniversary", month_day="02-29")
    assert berlin_utc(datetime(2026, 3, 29, 2, 30)) == datetime(2026, 3, 29, 1, tzinfo=UTC)  # noqa: DTZ001 -- intentional civil input
    assert berlin_utc(datetime(2026, 10, 25, 2, 30)) == datetime(2026, 10, 25, 0, 30, tzinfo=UTC)  # noqa: DTZ001 -- intentional civil input


async def test_calendar_is_scheduled_without_second_reevaluation(runtime, config):
    data = definition()
    data["inputs"][0]["schema"] = schema("number")
    data["schema"]["fields"]["value"] = schema("number")
    doc = registry(config, data)
    doc["dependencies"][0]["kind"] = "clock"
    doc["bindings"][0]["adapter"] = {
        "kind": "scheduler",
        "calendar": {"projection": "minute_of_day"},
    }
    doc["bindings"][0].pop("transform", None)
    await activate(runtime, doc)
    seq = runtime.state.publication_seq
    runtime.clock.advance(1)
    await runtime.submit("tick")
    assert runtime.state.publication_seq == seq
    runtime.clock.advance(59)
    await runtime.submit("tick")
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == 781
    assert runtime.state.publication_seq > seq


def test_time_reached_is_typed_and_preserves_unknown():
    data = definition({"op": "time_reached", "at": {"op": "input", "name": "a"}})
    data.update(language_version=2)
    data["inputs"][0]["schema"] = schema("timestamp")
    compiled = DeclarativeDefinition.model_validate(data)
    compile_definition(compiled)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    rule = compiled.outputs["value"]
    assert (
        Evaluation(
            compiled,
            {"a": FieldValue(status="valid", value=now.isoformat(), quality="healthy")},
            now,
        )
        .evaluate(rule)
        .value
        is True
    )
    assert Evaluation(compiled, {}, now).evaluate(rule).status == "unknown"
