"""Synthetic UX12 devices for the isolated Workbench harness, never real HA."""

import json
from pathlib import Path
from typing import Any

from core_contracts.adapters.ha import BridgeAdapter


def fixtures(root: Path) -> list[dict[str, Any]]:
    document = json.loads(
        (root / "frontend/test/fixtures/ux12-komplett.json").read_text(encoding="utf-8")
    )
    sources = {source["source_id"]: source for source in document["sources"]}
    result = []
    for binding in document["bindings"]:
        source = sources[binding["source_id"]]
        boolean = source["source_type"] == "boolean"
        unit = source.get("value_schema", {}).get("unit")
        entity = binding["adapter"]["ha_entity_id"]
        result.append(
            {
                "entity_id": entity,
                "display_name": source.get("display_name", entity),
                "unit": unit,
                "device_class": "window" if boolean else "temperature",
                "state_class": None if boolean else "measurement",
                "attributes": [],
                "current_value": "off"
                if boolean
                else "unavailable"
                if "unavailable" in source["source_id"]
                else "unknown"
                if "unknown" in source["source_id"]
                else "21.5",
                "area_id": "testbereich",
                "area_name": "Testbereich",
            }
        )
    return sorted(result, key=lambda item: item["entity_id"])


def attach(adapter: BridgeAdapter, root: Path) -> list[dict[str, Any]]:
    entities = fixtures(root)

    async def discover(*, preview: bool = False) -> list[dict[str, Any]]:
        return [
            {
                key: value
                for key, value in entity.items()
                if preview or key not in {"current_value", "area_id", "area_name"}
            }
            for entity in entities
        ]

    adapter.runtime.entity_discovery = discover
    return entities


async def feed(adapter: BridgeAdapter, entities: list[dict[str, Any]]) -> None:
    runtime = adapter.runtime
    config = runtime.config
    if not config:
        return
    by_id = {entity["entity_id"]: entity for entity in entities}
    now = runtime.clock.now_utc().isoformat()
    for binding in config.bindings:
        entity = by_id.get(binding.adapter.ha_entity_id)
        if not entity or binding.adapter.kind != "ha_state":
            continue
        state = {"state": entity["current_value"], "attributes": {}, "last_reported": now}
        observation = adapter.observation(binding, state, "report", {"last_reported": now}, config)
        await runtime.submit("observation", observation)
