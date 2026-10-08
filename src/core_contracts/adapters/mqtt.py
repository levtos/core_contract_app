"""MQTT carries native observations only; retained data never becomes positive evidence."""

import asyncio
import json
import logging
import ssl
from typing import Any

import aiohttp
import aiomqtt

from ..evidence import Observation
from ..model import checksum
from ..registry import Binding, RegistryConfig
from ..runtime import Runtime
from .ha import timestamp, transform

LOGGER = logging.getLogger(__name__)


def at_path(document: Any, path: str | None) -> Any:
    if path is None:
        return document
    for part in path.split("."):
        document = document[int(part)] if isinstance(document, list) else document[part]
    return document


class MQTTAdapter:
    def __init__(
        self,
        runtime: Runtime,
        session: aiohttp.ClientSession,
        mode: str,
        options: dict[str, Any],
        supervisor_token: str,
    ) -> None:
        self.runtime, self.session, self.mode, self.options = runtime, session, mode, options
        self.supervisor_token = supervisor_token
        self.seen: dict[str, str] = {}
        self.sequence = 0
        self.queue_overflow = False
        self.retry_delay = 1.0
        adapter = self

        class ObservableQueue(asyncio.Queue[aiomqtt.Message]):
            def put_nowait(self, item: aiomqtt.Message) -> None:
                if self.full():
                    adapter.queue_overflow = True
                    adapter.runtime.overflow = True
                    adapter.runtime.overflow_serial += 1
                    adapter.runtime.overflow_bindings.update(
                        b.binding_id
                        for b in (adapter.runtime.config.bindings if adapter.runtime.config else ())
                        if b.adapter.kind == "mqtt"
                    )
                    adapter.runtime.mqtt_revision_changed.set()
                super().put_nowait(item)

        self.queue_type = ObservableQueue

    def observation(
        self, binding: Binding, config: RegistryConfig, payload: bytes, retained: bool, qos: int
    ) -> Observation | None:
        data = json.loads(payload)
        value = at_path(data, binding.adapter.mqtt_value_path)
        measured = (
            timestamp(at_path(data, binding.adapter.mqtt_time_path))
            if binding.adapter.mqtt_time_path
            else None
        )
        digest = checksum({"data": data, "retained": retained})
        if self.seen.get(binding.binding_id) == digest:
            return None
        self.seen[binding.binding_id] = digest
        self.sequence += 1
        return Observation(
            source_id=binding.source_id,
            binding_id=binding.binding_id,
            adapter="mqtt",
            value_raw=value,
            value_normalized=transform(value, binding, config),
            normalized=True,
            device_time=measured,
            received_at=self.runtime.clock.now_utc(),
            observation_kind="report",
            mqtt_retained=retained,
            mqtt_qos=qos,
            epoch_id=self.runtime.state.epoch_id,
            ingest_seq=self.sequence,
        )

    async def credentials(self) -> dict[str, Any]:
        if self.mode == "external":
            return self.options
        async with self.session.get(
            "http://supervisor/services/mqtt",
            headers={"Authorization": f"Bearer {self.supervisor_token}"},
        ) as response:
            response.raise_for_status()
            result = await response.json()
            data: dict[str, Any] = result["data"]
            return data

    async def run(self) -> None:
        if self.mode == "disabled":
            await asyncio.Future()
            return
        while True:
            self.runtime.mqtt_revision_changed.clear()
            config = self.runtime.config
            if config is None:
                await self.runtime.clock.sleep(1)
                continue
            revision = self.runtime.state.active_revision
            try:
                credentials = await self.credentials()
                self.queue_overflow = False
                async with aiomqtt.Client(
                    hostname=credentials["host"],
                    port=int(credentials["port"]),
                    username=credentials.get("username") or None,
                    password=credentials.get("password") or None,
                    tls_context=ssl.create_default_context(cafile=credentials.get("ca") or None)
                    if credentials.get("tls")
                    else None,
                    max_queued_incoming_messages=256,
                    queue_type=self.queue_type,
                ) as client:
                    bindings = [b for b in config.bindings if b.adapter.kind == "mqtt"]
                    for binding in bindings:
                        await client.subscribe(binding.adapter.mqtt_topic or "", qos=1)
                    await self.runtime.submit("mqtt_state", "connected")
                    self.seen.clear()
                    self.retry_delay = 1.0
                    LOGGER.info("mqtt_connected")

                    async def ingest() -> None:
                        async for message in client.messages:
                            for binding in bindings:
                                if str(message.topic) != binding.adapter.mqtt_topic:
                                    continue
                                try:
                                    raw = message.payload
                                    if not isinstance(raw, (bytes, bytearray)):
                                        raise ValueError("non-byte payload")
                                    observation = self.observation(
                                        binding, config, bytes(raw), message.retain, message.qos
                                    )
                                    if observation:
                                        self.runtime.ingest(observation)
                                except ValueError, TypeError, KeyError, IndexError:
                                    self.sequence += 1
                                    self.runtime.ingest(
                                        Observation(
                                            source_id=binding.source_id,
                                            binding_id=binding.binding_id,
                                            adapter="mqtt",
                                            received_at=self.runtime.clock.now_utc(),
                                            observation_kind="report",
                                            epoch_id=self.runtime.state.epoch_id,
                                            ingest_seq=self.sequence,
                                            invalid_timestamp=True,
                                        )
                                    )
                                    LOGGER.warning("mqtt_invalid_message")

                    async def changed() -> None:
                        while (
                            revision == self.runtime.state.active_revision
                            and not self.runtime.mqtt_revision_changed.is_set()
                            and not self.queue_overflow
                        ):
                            await self.runtime.clock.sleep(1)

                    reader, watcher = asyncio.create_task(ingest()), asyncio.create_task(changed())
                    try:
                        done, _ = await asyncio.wait(
                            {reader, watcher}, return_when=asyncio.FIRST_COMPLETED
                        )
                        for task in done:
                            task.result()
                    finally:
                        reader.cancel()
                        watcher.cancel()
                        await asyncio.gather(reader, watcher, return_exceptions=True)
            except Exception as error:
                LOGGER.warning("mqtt_disconnected", extra={"error_type": type(error).__name__})
                try:
                    await self.runtime.submit("mqtt_state", "disconnected")
                except Exception as status_error:
                    LOGGER.warning(
                        "mqtt_status_failed", extra={"error_type": type(status_error).__name__}
                    )
                await self.runtime.clock.sleep(self.retry_delay)
                self.retry_delay = min(self.retry_delay * 2, 30)
