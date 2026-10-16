"""The original public UX12 registry against an isolated real API, adapter and engine."""

import json
from pathlib import Path

from aiohttp import ClientSession

from core_contracts.adapters.ha import BridgeAdapter

from .test_workbench_api import api_client

FIXTURE = Path(__file__).resolve().parents[1] / "frontend/test/fixtures/ux12-komplett.json"


async def test_ux12_typed_ingestion_and_machine_recovery(runtime, aiohttp_client, tmp_path):
    _, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    document = json.loads(FIXTURE.read_text())
    # Same explicit conversions produced by the UI, with no custom transformation.
    for binding in document["bindings"]:
        source = next(s for s in document["sources"] if s["source_id"] == binding["source_id"])
        binding["transform"] = {
            "kind": "type_cast",
            "target": "bool" if source["source_type"] == "boolean" else "number",
        }
    # The old test document omitted the mandatory recovery condition, and declared
    # a unit on delta although this operator's existing output schema is unitless.
    document["definitions"][2]["schema"]["fields"]["differenz"].pop("unit")
    document["definitions"][3]["machine"]["reinitialize_when"] = {
        "op": "not",
        "args": [{"op": "input", "name": "offen"}],
    }
    response = await client.post("/api/v1/registry/validate", headers=headers, json=document)
    report = await response.json()
    assert report["valid"], report
    response = await client.post(
        "/api/v1/registry/drafts", headers=headers, json={"config": document}
    )
    draft = await response.json()
    response = await client.post(
        f"/api/v1/registry/drafts/{draft['draft_id']}/activate",
        headers=headers,
        json={"draft_version": draft["draft_version"], "expected_active_revision": 0},
    )
    assert response.status == 200, await response.json()
    config = runtime.config
    assert config is not None
    async with ClientSession() as session:
        adapter = BridgeAdapter(runtime, session, "http://127.0.0.1:1", "synthetic")

        async def ingest(index, value):
            runtime.clock.advance(1)
            now = runtime.clock.now_utc().isoformat()
            state = {
                "state": value,
                "attributes": {},
                "last_updated": now,
                "last_changed": now,
                "last_reported": now,
            }
            item = adapter.observation(config.bindings[index], state, "live_change", {}, config)
            await runtime.submit("observation", item)

        for i, value in enumerate(["23.4", "8.2", "22.8", "on", "unavailable", "unknown", "off"]):
            await ingest(i, value)
        contracts = runtime.snapshot()["contracts"]
        assert contracts["bad.temperatur"]["fields"]["value"]["value"] == 23.4
        assert contracts["bad.warm"]["fields"]["value"]["value"] is True
        assert contracts["fenster.offen"]["fields"]["value"]["value"] is False
        for contract in ("test.unavailable", "test.unknown"):
            assert contracts[contract]["fields"]["value"]["status"] == "unknown"
        first = runtime.state.tables["sm_instance"]["wohnzimmer.lueften"]["episode_id"]
        # A binding repair invalidates the old machine context.
        document["bindings"][6]["adapter"]["ha_entity_id"] = "binary_sensor.synthetic_repaired"
        from .conftest import activate

        await activate(runtime, document)
        config = runtime.config
        for value in ("unknown", "unavailable", "on"):
            await ingest(6, value)
            assert (
                runtime.snapshot()["contracts"]["wohnzimmer.lueften"]["fields"]["value"]["status"]
                == "unknown"
            )
        await ingest(6, "off")
        restored = runtime.state.tables["sm_instance"]["wohnzimmer.lueften"]
        assert restored["state"] == "ruhe" and restored["episode_id"] != first
        assert restored["transition_reason"] == "reinitialize_when" and restored["evidence"]
