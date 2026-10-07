"""Public transport client. No imports from or access to the platform runtime."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import aiohttp
from pydantic import BaseModel, ConfigDict


class InstallationMismatch(ValueError):
    pass


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="allow")
    epoch_id: str
    publication_seq: int
    contracts: dict[str, Any]
    publication_confirmed: bool = True


class CoreContractsClient:
    def __init__(self, base_url: str, token: str, expected_installation_id: str) -> None:
        if not base_url or not token or not expected_installation_id:
            raise ValueError("explicit connection and identity required")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.expected_installation_id = expected_installation_id
        self.connection_state = "disconnected"
        self.publication_confirmed = False
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> CoreContractsClient:
        self._session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=aiohttp.ClientTimeout(total=30),
        )
        try:
            await self.info()
        except BaseException:
            await self.close()
            raise
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None
        self.connection_state = "disconnected"
        self.publication_confirmed = False

    @property
    def session(self) -> aiohttp.ClientSession:
        if self._session is None:
            raise RuntimeError("use async with CoreContractsClient")
        return self._session

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        async with self.session.request(
            method, f"{self.base_url}/api/v1/{path}", **kwargs
        ) as response:
            response.raise_for_status()
            return await response.json()

    async def info(self) -> dict[str, Any]:
        data: dict[str, Any] = await self._request("GET", "info")
        if data["installation_id"] != self.expected_installation_id:
            raise InstallationMismatch("installation_mismatch")
        return data

    async def snapshot(self, contracts: list[str] | None = None) -> Snapshot:
        await self.info()
        data = await self._request(
            "GET", "snapshot", params={"contracts": ",".join(contracts)} if contracts else {}
        )
        snapshot = Snapshot.model_validate(data)
        self.publication_confirmed = snapshot.publication_confirmed
        return snapshot

    async def contract(self, contract_id: str) -> dict[str, Any]:
        await self.info()
        data: dict[str, Any] = await self._request("GET", f"contracts/{contract_id}")
        return data

    async def command(self, envelope: dict[str, Any]) -> dict[str, Any]:
        await self.info()
        try:
            result: dict[str, Any] = await self._request("POST", "commands", json=envelope)
            return result
        except (aiohttp.ClientConnectionError, TimeoutError):
            try:
                stored: dict[str, Any] = await self._request(
                    "GET", f"commands/{envelope['command_id']}"
                )
                return stored
            except aiohttp.ClientResponseError as error:
                if error.status != 404:
                    raise
                retry: dict[str, Any] = await self._request("POST", "commands", json=envelope)
                return retry

    async def subscribe(self, contracts: list[str] | None = None) -> AsyncIterator[dict[str, Any]]:
        while self._session is not None:
            self.connection_state = "connecting"
            try:
                async with self.session.ws_connect(
                    f"{self.base_url}/api/v1/ws", heartbeat=30
                ) as socket:
                    await socket.send_json(
                        {
                            "type": "hello",
                            "protocol_version": 1,
                            "expected_installation_id": self.expected_installation_id,
                        }
                    )
                    welcome = await socket.receive_json()
                    if welcome.get("type") == "installation_mismatch":
                        raise InstallationMismatch("installation_mismatch")
                    if (
                        welcome.get("type") != "welcome"
                        or welcome.get("installation_id") != self.expected_installation_id
                    ):
                        raise InstallationMismatch("invalid_welcome")
                    await socket.send_json(
                        {"type": "subscribe", "id": "client", "contracts": contracts}
                    )
                    seq, epoch = -1, ""
                    self.connection_state = "resyncing"
                    async for message in socket:
                        if message.type != aiohttp.WSMsgType.TEXT:
                            break
                        event = message.json()
                        kind = event.get("type")
                        if kind == "service_state":
                            self.publication_confirmed = event["publication_confirmed"]
                        elif kind == "snapshot":
                            snapshot = Snapshot.model_validate(event)
                            seq, epoch = snapshot.publication_seq, snapshot.epoch_id
                            self.publication_confirmed = snapshot.publication_confirmed
                            self.connection_state = "connected"
                        elif kind == "resync_required" or (
                            kind == "delta"
                            and (event["prev_seq"] != seq or event["epoch_id"] != epoch)
                        ):
                            self.connection_state = "resyncing"
                            await socket.send_json(
                                {"type": "subscribe", "id": "resync", "contracts": contracts}
                            )
                            continue
                        elif kind == "delta":
                            seq = event["publication_seq"]
                        elif kind == "going_away":
                            self.connection_state = "reconnecting"
                            self.publication_confirmed = False
                        yield event
            except (aiohttp.ClientError, TimeoutError):
                self.connection_state = "reconnecting"
            finally:
                self.publication_confirmed = False
            if self._session is not None:
                # Client scheduling is transport retry only, not contract time.
                await asyncio.sleep(1)  # noqa: TID251
