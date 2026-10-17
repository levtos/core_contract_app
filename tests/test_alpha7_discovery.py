"""P6 read-only selection previews, isolated from observations and engine state."""

import copy
from pathlib import Path

import aiohttp

from core_contracts.adapters.ha import BridgeAdapter
from dev.fake_ha import FakeHA
from dev.workbench_devices import fixtures
from tests.test_workbench_api import api_client


def test_synthetic_ux12_discovery_keeps_utf8_units_on_windows():
    entities = fixtures(Path(__file__).resolve().parents[1])
    assert (
        next(
            entity
            for entity in entities
            if entity["entity_id"] == "sensor.bath_climate_temperature"
        )["unit"]
        == "°C"
    )


async def test_preview_is_explicit_admin_only_bounded_and_separate_from_metadata_cache(
    runtime, aiohttp_client, aiohttp_server, tmp_path
):
    fixture = FakeHA(
        {
            "sensor.room": {
                "state": "21.5",
                "attributes": {
                    "friendly_name": "Zimmer",
                    "password": "hidden",
                    "unit_of_measurement": "°C",
                },
            }
        },
        registries={
            "config/area_registry/list": [
                {"area_id": "living", "name": "Wohnzimmer"},
                {"area_id": "office", "name": "Büro"},
            ],
            "config/device_registry/list": [
                {"id": "device", "area_id": "living", "secret": "hidden"}
            ],
            "config/entity_registry/list": [
                {"entity_id": "sensor.room", "device_id": "device", "area_id": "office"}
            ],
        },
    )
    ha = await aiohttp_server(fixture.application())
    api, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    before = copy.deepcopy(runtime.state.tables)
    async with aiohttp.ClientSession() as session:
        BridgeAdapter(runtime, session, str(ha.make_url("/websocket")), "test-only")
        preview = await (await client.get("/api/v1/ha/entities?preview=1", headers=headers)).json()
        assert preview["items"][0]["current_value"] == "21.5"
        assert preview["items"][0]["area_name"] == "Büro"  # entity assignment wins
        assert "hidden" not in str(preview)
        assert (await client.get("/api/v1/ha/entities?preview=1", headers=headers)).status == 200
        assert len(fixture.requests) == 4
        metadata = await (await client.get("/api/v1/ha/entities", headers=headers)).json()
        assert "current_value" not in metadata["items"][0]
        assert "21.5" not in str(metadata)
        consumer = {"Authorization": "Bearer " + api.tokens.values["consumer"]}
        assert (await client.get("/api/v1/ha/entities?preview=1", headers=consumer)).status == 403
        assert (await client.get("/api/v1/ha/entities?preview=yes", headers=headers)).status == 400
    assert runtime.state.tables == before
    assert all(
        request["type"]
        in {
            "get_states",
            "config/area_registry/list",
            "config/device_registry/list",
            "config/entity_registry/list",
        }
        for request in fixture.requests
    )


async def test_preview_uses_device_area_without_entity_override_and_caps_state_length(
    runtime, aiohttp_server
):
    fixture = FakeHA(
        {"sensor.room": {"state": "x" * 1000, "attributes": {}}},
        registries={
            "config/area_registry/list": [{"area_id": "living", "name": "Wohnzimmer"}],
            "config/device_registry/list": [{"id": "device", "area_id": "living"}],
            "config/entity_registry/list": [
                {"entity_id": "sensor.room", "device_id": "device", "area_id": None}
            ],
        },
    )
    ha = await aiohttp_server(fixture.application())
    async with aiohttp.ClientSession() as session:
        adapter = BridgeAdapter(runtime, session, str(ha.make_url("/websocket")), "test-only")
        item = (await adapter.discover(preview=True))[0]
    assert item["area_name"] == "Wohnzimmer"
    assert len(item["current_value"]) == 256
