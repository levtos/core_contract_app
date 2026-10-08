"""Actual HA state engine + event helpers + our decorated Bridge callback.

Runs in the dedicated HA CI job. This is not a Supervisor installation test.
"""

from types import SimpleNamespace

import pytest

pytest.importorskip("homeassistant")
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from custom_components.core_contracts_bridge import async_setup_entry


@pytest.mark.ha
async def test_real_state_reported_callback_and_unsubscribe(tmp_path, monkeypatch):
    hass = HomeAssistant(str(tmp_path))
    commands = {}
    monkeypatch.setattr(
        websocket_api,
        "async_register_command",
        lambda hass, handler: commands.update({handler.__name__: handler}),
    )
    unload = []
    entry = SimpleNamespace(async_on_unload=unload.append)
    events = []
    connection = SimpleNamespace(
        user=SimpleNamespace(is_admin=True),
        subscriptions={},
        send_result=lambda *args: None,
        send_event=lambda identifier, event: events.append(event),
        send_error=lambda *args: events.append({"error": args[1]}),
    )
    await async_setup_entry(hass, entry)
    hass.states.async_set("sensor.fixture", "on")
    await hass.async_block_till_done()
    commands["subscribe"](
        hass, connection, {"id": 1, "protocol_version": 1, "entity_ids": ["sensor.fixture"]}
    )
    # The state engine itself emits state_reported with its real event.data.
    hass.states.async_set("sensor.fixture", "on")
    await hass.async_block_till_done()
    reports = [event for event in events if event.get("kind") == "reported"]
    assert len(reports) == 1
    assert (
        reports[0]["last_reported"] == hass.states.get("sensor.fixture").last_reported.isoformat()
    )
    for number in range(2, 102):
        commands["subscribe"](
            hass,
            connection,
            {
                "id": number,
                "protocol_version": 1,
                "entity_ids": ["sensor.fixture"],
                "report_entity_ids": [],
            },
        )
        connection.subscriptions.pop(number)()
    assert len(unload) == 1
    assert len(hass.data["core_contracts_bridge"]) == 1
    connection.subscriptions.pop(1)()
    count = len(events)
    hass.states.async_set("sensor.fixture", "on")
    await hass.async_block_till_done()
    assert len(events) == count
    unload[0]()
    commands["subscribe"](hass, connection, {"id": 103, "protocol_version": 1, "entity_ids": []})
    assert events[-1]["error"] == "bridge_unloaded"
