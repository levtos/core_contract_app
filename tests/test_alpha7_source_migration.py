"""P8 uses ordinary draft validation/activation; historical evidence is never retyped."""

import copy

import pytest

from core_contracts.validation import RegistryValidationError

from .conftest import activate
from .test_declarative import definition, observation, registry, schema
from .test_workbench_api import api_client


def migrated(document, *, partial=False):
    candidate = copy.deepcopy(document)
    value_schema = schema("number", unit="°C")
    source = {**copy.deepcopy(document["sources"][0]), "source_id": "source.new"}
    source.update(source_type="numeric", value_schema=value_schema)
    candidate["sources"].append(source)
    binding = {**copy.deepcopy(document["bindings"][0]), "binding_id": "binding.new"}
    binding.update(source_id="source.new", transform={"kind": "type_cast", "target": "number"})
    if partial:
        source["physical_source_key"] = "physical.new"
        binding["adapter"]["ha_entity_id"] = "sensor.new"
        candidate["bindings"].append(binding)
    else:
        candidate["bindings"] = [binding]
    template = copy.deepcopy(document["definitions"][0])
    template["type_version"] = 2
    template["inputs"][0]["schema"] = value_schema
    template["schema"]["fields"]["value"] = value_schema
    candidate["definitions"].append(template)
    candidate["contracts"][0]["inputs"][0]["ref"] = "source.new"
    candidate["contracts"][0]["type_version"] = 2
    return candidate


async def test_whole_move_retains_old_source_and_evidence_then_survives_restore(
    runtime, config, aiohttp_client, tmp_path
):
    _, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    document = registry(config, definition())
    await activate(runtime, document)
    item = observation(runtime, True)
    await runtime.submit("observation", item)
    candidate = migrated(document)
    response = await client.post("/api/v1/registry/validate", headers=headers, json=candidate)
    assert response.status == 200 and (await response.json())["valid"]
    await activate(runtime, candidate)
    assert runtime.config.sources[0].source_id == "source.a"
    assert runtime.config.bindings[0].source_id == "source.new"
    # The old boolean value cannot become a current numeric measurement.
    field = runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]
    assert field["status"] == "unknown" and field["value"] is None
    evidence = await client.get("/api/v1/evidence/reference/" + item.reference, headers=headers)
    assert evidence.status == 200
    assert (await evidence.json())["value_raw"] is True
    history = await client.get(
        "/api/v1/history/query/observations?source_id=source.a", headers=headers
    )
    assert any(row["value_raw"] is True for row in (await history.json())["items"])
    runtime.clock.advance(1)
    await runtime.submit(
        "observation",
        observation(runtime, 21.5).model_copy(
            update={"source_id": "source.new", "binding_id": "binding.new", "ingest_seq": 2}
        ),
    )
    assert runtime.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["value"] == 21.5
    await runtime.submit("recover")
    assert (await runtime.store.evidence(item.reference))["value_raw"] is True
    # Removing the unused old source is optional; it cannot erase the historical lock.
    removed = copy.deepcopy(candidate)
    removed["sources"] = removed["sources"][1:]
    await activate(runtime, removed)
    forbidden = copy.deepcopy(candidate)
    forbidden["sources"][0]["source_type"] = "numeric"
    forbidden["sources"][0]["value_schema"] = schema("number")
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", forbidden)
    assert "immutable_source_type" in {issue.code for issue in error.value.issues}
    assert (await runtime.store.evidence(item.reference))["value_raw"] is True


async def test_partial_move_preserves_other_contract_and_cannot_duplicate_adapter(runtime, config):
    document = registry(config, definition())
    document["contracts"].append(
        {**copy.deepcopy(document["contracts"][0]), "contract_id": "other"}
    )
    await activate(runtime, document)
    candidate = migrated(document, partial=True)
    assert (await runtime.submit("validate", candidate))["valid"]
    await activate(runtime, candidate)
    contracts = {contract.contract_id: contract for contract in runtime.config.contracts}
    assert contracts["other"].inputs[0].ref == "source.a"
    assert contracts["fixture.echo"].inputs[0].ref == "source.new"
    broken = copy.deepcopy(candidate)
    broken["bindings"][1]["adapter"] = copy.deepcopy(broken["bindings"][0]["adapter"])
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", broken)
    assert "duplicate_adapter" in {issue.code for issue in error.value.issues}
    broken = copy.deepcopy(candidate)
    broken["sources"][1]["physical_source_key"] = broken["sources"][0]["physical_source_key"]
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", broken)
    assert "duplicate_evidence" in {issue.code for issue in error.value.issues}


async def test_migration_cannot_bypass_consumer_type_validation(runtime, config):
    document = registry(config, definition())
    await activate(runtime, document)
    candidate = migrated(document)
    candidate["contracts"][0]["type_version"] = 1
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", candidate)
    assert "input_type_mismatch" in {issue.code for issue in error.value.issues}
    assert runtime.state.active_revision == 1
