"""Bridge protocol client and generic observation normalization."""

import asyncio
import logging
from datetime import datetime
from typing import Any

import aiohttp

from ..evidence import Observation
from ..model import utc
from ..registry import Binding, RegistryConfig
from ..runtime import Runtime

LOGGER = logging.getLogger(__name__)


def timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    return utc(datetime.fromisoformat(str(value)))


def transform(value: Any, binding: Binding, config: RegistryConfig) -> Any:
    transformation = binding.transform
    if transformation is None:
        return value
    if transformation.kind == "type_cast":
        if transformation.target == "number":
            return float(value)
        if transformation.target == "bool":
            if value not in (True, False, "true", "false", "on", "off"):
                raise ValueError("invalid boolean")
            return value in (True, "true", "on")
        return str(value)
    if transformation.kind == "unit_scale":
        assert transformation.factor is not None and transformation.offset is not None
        return float(value) * transformation.factor + transformation.offset
    catalog = next(c for c in config.catalogs if c.catalog_id == transformation.catalog_id)
    return catalog.entries[str(value)]


class BridgeAdapter:
    def __init__(
        self, runtime: Runtime, session: aiohttp.ClientSession, url: str, token: str
    ) -> None:
        self.runtime, self.session, self.url, self.token = runtime, session, url, token
        self.states: dict[str, dict[str, Any] | None] = {}
        self.sequence = 0
        self.bridge_version: str | None = None
        self.subscription_count = 0
        self.retry_delay = 1.0

    def observation(
        self,
        binding: Binding,
        state: dict[str, Any] | None,
        kind: str,
        event: dict[str, Any],
        config: RegistryConfig,
    ) -> Observation:
        self.sequence += 1
        attributes = (state or {}).get("attributes", {})
        value = (state or {}).get("state")
        availability = "absent" if state is None else "available"
        if value in ("unknown", "unavailable"):
            availability = value
        if binding.adapter.kind == "ha_attribute":
            value = attributes.get(binding.adapter.ha_attribute)
        normalized = value
        if availability == "available":
            try:
                normalized = transform(value, binding, config)
            except ValueError, TypeError, KeyError:
                availability = "unknown"
        source = next(s for s in config.sources if s.source_id == binding.source_id)
        raw_times = {
            "device_time": attributes.get(binding.adapter.ha_time_attribute)
            if binding.adapter.ha_time_attribute
            else None,
            "ha_last_changed": (state or {}).get("last_changed"),
            "ha_last_updated": (state or {}).get("last_updated"),
            "ha_last_reported": event.get("last_reported", (state or {}).get("last_reported")),
            "ha_time_fired": event.get("time_fired"),
        }
        times: dict[str, datetime | None] = {}
        invalid_timestamp = False
        for key, raw_time in raw_times.items():
            try:
                times[key] = timestamp(raw_time)
            except ValueError, TypeError, OverflowError:
                times[key] = None
                invalid_timestamp = True
        return Observation.model_validate(
            {
                "source_id": binding.source_id,
                "binding_id": binding.binding_id,
                "adapter": binding.adapter.kind,
                "source_origin": source.source_origin,
                "value_raw": value,
                "value_normalized": normalized,
                "normalized": True,
                **times,
                "invalid_timestamp": invalid_timestamp,
                "ha_context_id": event.get("context_id", event.get("context", {}).get("id")),
                "received_at": self.runtime.clock.now_utc(),
                "observation_kind": kind,
                "ha_restored": bool(attributes.get("restored", False)),
                "assumed_state": bool(attributes.get("assumed_state", False)),
                "epoch_id": self.runtime.state.epoch_id,
                "ingest_seq": self.sequence,
                "availability": availability,
            }
        )

    async def event(self, event: dict[str, Any], config: RegistryConfig) -> None:
        kind = event["kind"]
        if kind == "bridge_reloaded":
            raise ConnectionError("bridge_reloaded")
        if kind == "snapshot":
            self.states = event["states"]
            observations = []
            for binding in config.bindings:
                entity = binding.adapter.ha_entity_id
                if entity:
                    observations.append(
                        self.observation(binding, self.states.get(entity), "snapshot", {}, config)
                    )
            self.runtime.ingest_snapshot(observations)
            return
        entity = event["entity_id"]
        if kind == "changed":
            self.states[entity] = event["new_state"]
        elif kind == "reported" and self.states.get(entity) is not None:
            self.states[entity] = {
                **(self.states[entity] or {}),
                "last_reported": event["last_reported"],
            }
        for binding in config.bindings:
            if binding.adapter.ha_entity_id == entity:
                self.runtime.ingest(
                    self.observation(
                        binding,
                        self.states.get(entity),
                        "report" if kind == "reported" else "live_change",
                        event,
                        config,
                    )
                )

    async def _result(
        self, socket: aiohttp.ClientWebSocketResponse, request: dict[str, Any]
    ) -> Any:
        await socket.send_json(request)
        response = await socket.receive_json()
        if response.get("id") != request["id"] or not response.get("success"):
            raise ConnectionError("bridge_request_failed")
        return response.get("result")

    async def connect(self, config: RegistryConfig) -> None:
        self.runtime.resubscribe.clear()
        self.runtime.revision_changed.clear()
        async with self.session.ws_connect(
            self.url, heartbeat=20, max_msg_size=4_000_000
        ) as socket:
            if (await socket.receive_json()).get("type") != "auth_required":
                raise ConnectionError("ha_auth_protocol")
            await socket.send_json({"type": "auth", "access_token": self.token})
            if (await socket.receive_json()).get("type") != "auth_ok":
                raise ConnectionError("ha_auth_failed")
            info = await self._result(socket, {"id": 1, "type": "core_contracts_bridge/info"})
            if info.get("protocol_version") != 1:
                raise ConnectionError("bridge_incompatible")
            self.bridge_version = info["bridge_version"]
            await self._result(socket, {"id": 2, "type": "get_config"})
            for number, event_type in enumerate(("homeassistant_started", "homeassistant_stop"), 3):
                await self._result(
                    socket, {"id": number, "type": "subscribe_events", "event_type": event_type}
                )
            entities = sorted(
                {b.adapter.ha_entity_id for b in config.bindings if b.adapter.ha_entity_id}
            )
            self.subscription_count = len(entities)
            live_sources = {s.freshness.liveness_source for s in config.sources}
            report_sources = {
                s.source_id
                for s in config.sources
                if s.freshness.mode != "event_stateful" or s.source_id in live_sources
            }
            await self._result(
                socket,
                {
                    "id": 5,
                    "type": "core_contracts_bridge/subscribe",
                    "protocol_version": 1,
                    "entity_ids": entities,
                    "report_entity_ids": sorted(
                        {
                            b.adapter.ha_entity_id
                            for b in config.bindings
                            if b.adapter.ha_entity_id and b.source_id in report_sources
                        }
                    ),
                },
            )
            await self.runtime.submit("bridge_state", ("connected", "connected"))
            self.retry_delay = 1.0
            LOGGER.info("bridge_connected")
            while True:
                receive = asyncio.create_task(socket.receive_json())
                change = asyncio.create_task(self.runtime.revision_changed.wait())
                overflow = asyncio.create_task(self.runtime.resubscribe.wait())
                pending = {receive, change, overflow}
                try:
                    done, _ = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                    if change in done or overflow in done:
                        return
                    message = receive.result()
                    if message.get("type") == "event":
                        if message["id"] == 5:
                            await self.event(message["event"], config)
                        else:
                            raise ConnectionError("ha_lifecycle")
                finally:
                    for task in pending:
                        if not task.done():
                            task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)

    async def run(self) -> None:
        while True:
            self.runtime.resubscribe.clear()
            self.runtime.revision_changed.clear()
            config = self.runtime.config
            if config is None:
                await self.runtime.clock.sleep(1)
                continue
            try:
                await self.connect(config)
            except Exception as error:
                LOGGER.warning("bridge_disconnected", extra={"error_type": type(error).__name__})
                await self.runtime.submit("bridge_state", ("unavailable", "disconnected"))
                await self.runtime.clock.sleep(self.retry_delay)
                self.retry_delay = min(self.retry_delay * 2, 30)

    async def request_refresh(self, source_id: str) -> None:
        config = self.runtime.config
        if config is None:
            raise ValueError("no registry")
        binding = next(b for b in config.bindings if b.source_id == source_id)
        entity = binding.adapter.ha_entity_id
        if entity is None:
            raise ValueError("refresh_not_supported")
        # This optional method is called only by a code-defined contract request.
        async with self.session.post(
            self.url.replace("ws://", "http://").replace(
                "/websocket", "/api/services/homeassistant/update_entity"
            ),
            headers={"Authorization": f"Bearer {self.token}"},
            json={"entity_id": entity},
        ) as response:
            response.raise_for_status()
