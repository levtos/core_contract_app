"""Editorial version metadata never changes the activated document or its hash."""

import copy

import pytest

from .test_workbench_api import api_client


async def test_version_metadata_survives_recovery_without_changing_configuration(
    runtime, config, aiohttp_client, tmp_path
):
    _, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    draft = await (
        await client.post("/api/v1/registry/drafts", headers=headers, json=config)
    ).json()
    path = "/api/v1/registry/drafts/" + draft["draft_id"] + "/activate"
    first = await (
        await client.post(
            path,
            headers=headers,
            json={
                "draft_version": 1,
                "expected_active_revision": 0,
                "note": "  Temperatursensor ergänzt  ",
                "_actor": {"kind": "forged", "role": "system"},
                "actor": {"kind": "forged", "role": "system"},
            },
        )
    ).json()
    saved = copy.deepcopy(first)
    assert first["note"] == "Temperatursensor ergänzt"
    assert first["actor"] == {"kind": "token", "role": "admin"}
    second = await (
        await client.post(
            path, headers=headers, json={"draft_version": 1, "expected_active_revision": 1}
        )
    ).json()
    assert "note" not in second
    assert second["config"] == first["config"]
    assert second["checksum"] == first["checksum"]
    third = await (
        await client.post(
            "/api/v1/registry/rollback",
            headers=headers,
            json={
                "revision": 1,
                "expected_active_revision": 2,
                "note": "Zurück zur ersten Version",
            },
        )
    ).json()
    assert third["note"] == "Zurück zur ersten Version"
    assert third["checksum"] == first["checksum"]
    await runtime.submit("recover")
    rows = await (await client.get("/api/v1/registry/revisions", headers=headers)).json()
    assert next(row for row in rows if row["revision"] == 1) == saved
    assert next(row for row in rows if row["revision"] == 3) == third
    events = await runtime.store.rows("diagnostic_event")
    assert any(
        event.get("operation") == "activate"
        and event.get("note") == first["note"]
        and event["actor"] == first["actor"]
        for event in events
    )


@pytest.mark.parametrize("note", [None, 7, {}, "x" * 257])
async def test_invalid_version_note_cannot_create_a_version(runtime, config, note):
    draft = await runtime.submit("draft_create", {"config": config})
    with pytest.raises(ValueError, match="invalid_revision_note"):
        await runtime.submit(
            "activate",
            {
                "draft_id": draft["draft_id"],
                "draft_version": 1,
                "expected_active_revision": 0,
                "note": note,
            },
        )
    assert runtime.state.active_revision == 0
    assert not await runtime.store.rows("registry_revision")
