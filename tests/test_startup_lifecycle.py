"""Continuous listener and single-signal ownership during slow bootstrap."""

import asyncio
import json
import signal
from pathlib import Path
from uuid import uuid4

import aiohttp
import pytest
import yaml
from aiohttp import web

import core_contracts.app as application
from core_contracts.persistence import MemoryStore


@pytest.mark.parametrize(
    "phase",
    [
        "fresh",
        "connect",
        "metadata",
        "ready",
        "older_database",
        "foreign_marker",
        "wizard_prepared",
        "wizard_db_identity",
        "wizard_completed",
    ],
)
async def test_startup_listener_and_sigterm_across_slow_initialization(
    tmp_path, monkeypatch, phase
):
    gate = asyncio.Event()
    signals = {}
    sites = []
    instances = []
    installation_id = str(uuid4())
    wizard = phase.startswith("wizard")
    has_marker = phase in {"older_database", "foreign_marker"}
    ready_phase = phase in {"ready", "older_database", "foreign_marker"} or wizard
    if wizard:
        from core_contracts.identity import write_private

        write_private(
            tmp_path / "setup/connection.json",
            json.dumps(
                {
                    "connection": {
                        "host": "fake-postgres",
                        "port": 5432,
                        "database": "cc_test",
                        "user": "cc_test",
                        "password": "ephemeral-test-only",
                        "sslmode": "disable",
                        "ca": "",
                    },
                    "prepared_identity": installation_id,
                    "initialize_empty_database": phase != "wizard_completed",
                    "adopt_installation_id": "",
                }
            ),
        )
        if phase == "wizard_completed":
            write_private(
                tmp_path / "installation.json", json.dumps({"installation_id": installation_id})
            )

        async def probe(connection, **kwargs):
            return {
                "server_version": 170000,
                "database_id": installation_id if phase != "wizard_prepared" else None,
                "empty": phase == "wizard_prepared",
            }

        monkeypatch.setattr(application, "probe", probe)
    if has_marker:
        (tmp_path / "installation.json").write_text(
            json.dumps({"installation_id": installation_id})
        )
        (tmp_path / "last_shutdown.json").write_text(
            json.dumps(
                {
                    "installation_id": installation_id
                    if phase == "older_database"
                    else str(uuid4()),
                    "publication_seq": 100,
                }
            )
        )
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
            if has_marker or (wizard and phase != "wizard_prepared"):
                self.metadata_values["installation_id"] = installation_id
                self.state.publication_seq = 7
            instances.append(self)

        async def open(self):
            if phase == "connect":
                await gate.wait()

        async def metadata(self, key):
            if phase == "metadata" or ready_phase:
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
    if phase != "fresh" and not wizard:
        options = options.model_copy(
            update={
                "postgres_host": "fake-postgres",
                "postgres_password": application.SecretStr("ephemeral-test-only"),
            }
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
                if ready_phase:
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
                    if wizard:
                        assert (await response.json())["installation_id"] == installation_id
                    assert (await session.get(url + "/health/live")).status == 200
                    if has_marker:
                        assert instances[0].state.publication_seq == (
                            100 if phase == "older_database" else 7
                        )
                        gaps = await instances[0].rows("history_gap")
                        assert any(
                            gap["reason"] == "database_older_than_last_shutdown" for gap in gaps
                        ) == (phase == "older_database")
                assert set(signals) == {signal.SIGTERM, signal.SIGINT}
                signals[signal.SIGTERM]()
                await task
        assert not instances[0].locked
        if wizard:
            pending = json.loads((tmp_path / "setup/connection.json").read_text())
            assert pending["prepared_identity"] == installation_id
            assert not pending["initialize_empty_database"]
        if has_marker:
            marker = json.loads((tmp_path / "last_shutdown.json").read_text())
            assert marker["installation_id"] == installation_id
            assert marker["publication_seq"] == instances[0].state.publication_seq
    finally:
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)
