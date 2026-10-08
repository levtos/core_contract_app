"""Continuous listener and single-signal ownership during slow bootstrap."""

import asyncio
import signal
from pathlib import Path

import aiohttp
import pytest
import yaml
from aiohttp import web

import core_contracts.app as application
from core_contracts.persistence import MemoryStore


@pytest.mark.parametrize("phase", ["connect", "metadata", "ready"])
async def test_startup_listener_and_sigterm_across_slow_initialization(
    tmp_path, monkeypatch, phase
):
    gate = asyncio.Event()
    signals = {}
    sites = []
    instances = []
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(
        loop, "add_signal_handler", lambda sig, callback: signals.update({sig: callback})
    )
    site_factory = web.TCPSite

    def site(runner, host, port):
        item = site_factory(runner, "127.0.0.1", 0)
        sites.append(item)
        return item

    monkeypatch.setattr(web, "TCPSite", site)

    class Store(MemoryStore):
        def __init__(self, *args, **kwargs):
            super().__init__()
            self.metadata_values = {}
            instances.append(self)

        async def open(self):
            if phase == "connect":
                await gate.wait()

        async def metadata(self, key):
            if phase in {"metadata", "ready"}:
                await gate.wait()
            return self.metadata_values.get(key)

        async def put_metadata(self, key, value):
            self.metadata_values[key] = value

    monkeypatch.setattr(application, "PostgresStore", Store)

    async def idle(self):
        await asyncio.Future()

    monkeypatch.setattr(application.BridgeAdapter, "run", idle)
    monkeypatch.setattr(application.MQTTAdapter, "run", idle)
    root = Path(__file__).resolve().parents[1]
    options = application.Options.model_validate(
        yaml.safe_load((root / "core_contracts/config.yaml").read_text())["options"]
    )
    task = asyncio.create_task(
        application.run(options, tmp_path, root / "migrations", root / "frontend")
    )
    try:
        async with asyncio.timeout(5):
            while not sites or sites[0]._server is None:
                await asyncio.sleep(0)  # noqa: TID251
            port = sites[0]._server.sockets[0].getsockname()[1]
            async with aiohttp.ClientSession() as session:
                url = f"http://127.0.0.1:{port}"
                assert (await session.get(url + "/health/live")).status == 200
                assert (await session.get(url + "/health/ready")).status == 503
                if phase == "ready":
                    gate.set()
                    token = (tmp_path / "secrets/consumer_token").read_text()
                    for _ in range(100):
                        response = await session.get(
                            url + "/api/v1/info", headers={"Authorization": "Bearer " + token}
                        )
                        if response.status == 200:
                            break
                        await asyncio.sleep(0)  # noqa: TID251
                    assert response.status == 200
                    assert (await session.get(url + "/health/live")).status == 200
                assert set(signals) == {signal.SIGTERM, signal.SIGINT}
                signals[signal.SIGTERM]()
                await task
        assert not instances[0].locked
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)
