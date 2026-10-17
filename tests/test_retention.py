import copy

import pytest

from core_contracts.history import HistoryQuery
from core_contracts.retention import EvidenceOutsideRetention

from .conftest import activate
from .test_declarative import definition, observation, registry, schema


async def prepared(runtime, config):
    data = definition()
    data["inputs"][0]["schema"] = schema("number")
    data["schema"]["fields"]["value"] = schema("number")
    config = registry(config, data)
    config["history_retention"] = {"raw_days": 1, "rollup_days": 10, "batch_size": 2}
    await activate(runtime, config)
    refs = []
    for i in range(5):
        await runtime.submit(
            "observation", observation(runtime, i).model_copy(update={"ingest_seq": i + 1})
        )
        refs.append(
            runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["evidence"][0]
        )
        runtime.clock.advance(1)
    runtime.clock.advance(2 * 86400)
    return refs


async def test_retention_is_bounded_pins_current_evidence_and_rolls_up_exactly_once(
    runtime, config
):
    references = await prepared(runtime, config)
    assert (await runtime.submit("retention_preview"))["selected"] == 2
    assert await runtime.store.evidence(references[0]) is not None
    await runtime.submit("retention_run")
    await runtime.submit("retention_run")
    assert (await runtime.submit("retention_run"))["selected"] == 0
    with pytest.raises(EvidenceOutsideRetention):
        await runtime.store.evidence(references[0])
    assert await runtime.store.evidence(references[-1]) is not None
    rollups = (await runtime.store.rollups(HistoryQuery()))["items"]
    assert len(rollups) == 1 and rollups[0]["count"] == 4
    assert (
        rollups[0]["minimum"] == 0 and rollups[0]["maximum"] == 3 and rollups[0]["average"] == 1.5
    )
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == 4


async def test_failed_retention_does_not_delete_or_duplicate_rollups(runtime, config):
    await prepared(runtime, config)
    before = copy.deepcopy(runtime.store.state.tables["source_observation_history"])

    def fail():
        raise OSError("injected maintenance failure")

    runtime.store.before_commit = fail
    try:
        with pytest.raises(OSError):
            await runtime.submit("retention_run")
        assert runtime.store.state.tables["source_observation_history"] == before
        assert runtime.store.observation_rollups == {}
    finally:
        runtime.store.before_commit = None


async def test_production_readiness_requires_explicit_retention_policy(runtime, config):
    runtime.require_history_retention = True
    await activate(runtime, config)
    runtime.first_snapshot = True
    assert "history_retention_required" in runtime.readiness_reasons
    assert not runtime.ready
    config["history_retention"] = {"raw_days": 1, "rollup_days": 7}
    await activate(runtime, config)
    assert "history_retention_required" not in runtime.readiness_reasons
    assert runtime.ready


async def test_retention_api_separates_preview_admin_mutation_and_expired_evidence(
    runtime, config, aiohttp_client, tmp_path
):
    from .test_workbench_api import api_client

    references = await prepared(runtime, config)
    api, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    consumer = {"Authorization": "Bearer " + api.tokens.values["consumer"]}
    response = await client.post("/api/v1/history/retention/run", headers=consumer)
    assert response.status == 403
    response = await client.post("/api/v1/history/retention/preview", headers=headers)
    assert response.status == 200 and (await response.json())["dry_run"]
    assert await runtime.store.evidence(references[0])
    assert (await client.post("/api/v1/history/retention/run", headers=headers)).status == 200
    response = await client.get("/api/v1/evidence/reference/" + references[0], headers=headers)
    assert response.status == 410
    assert (await response.json())["error"] == "evidence_outside_retention"
    assert (
        await client.get("/api/v1/evidence/reference/" + references[-1], headers=headers)
    ).status == 200
