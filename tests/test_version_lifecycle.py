import copy

import pytest

from core_contracts.validation import RegistryValidationError

from .conftest import activate
from .test_declarative import definition, registry


async def test_version_lifecycle_keeps_pinned_contract_and_requires_deliberate_reactivation(
    runtime, config
):
    doc = registry(config, definition())
    await activate(runtime, doc)
    fingerprint = runtime.state.tables["node_state"]["fixture.echo"]["fingerprint"]
    for state in ("deprecated", "retired"):
        doc["definitions"][0]["lifecycle"] = state
        await activate(runtime, doc)
        assert runtime.state.tables["node_state"]["fixture.echo"]["fingerprint"] == fingerprint
    new = copy.deepcopy(doc)
    new["contracts"].append({**new["contracts"][0], "contract_id": "example.new"})
    with pytest.raises(RegistryValidationError):
        await runtime.submit("validate", new)
    doc["definitions"][0]["lifecycle"] = "active"
    with pytest.raises(RegistryValidationError):
        await runtime.submit("validate", doc)
    doc["definitions"][0]["reactivation_note"] = "Bewusst wieder freigegeben"
    await activate(runtime, doc)
    assert (await runtime.store.definition("test.declarative", 1))[
        "reactivation_note"
    ] == "Bewusst wieder freigegeben"


async def test_catalog_version_cannot_be_reused_for_new_content(runtime, config):
    config["catalogs"] = [
        {"catalog_id": "example.catalog", "kind": "map", "version": 1, "entries": {"a": 1}}
    ]
    await activate(runtime, config)
    config["catalogs"][0]["entries"]["a"] = 2
    with pytest.raises(RegistryValidationError):
        await runtime.submit("validate", config)
    config["catalogs"][0]["version"] = 2
    await activate(runtime, config)
