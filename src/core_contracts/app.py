"""Supervisor process bootstrap and supervised asynchronous services."""

import asyncio
import json
import logging
import os
import signal
import ssl
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import aiohttp
import asyncpg
from aiohttp import web
from pydantic import Field, SecretStr

from .adapters.ha import BridgeAdapter
from .adapters.mqtt import MQTTAdapter
from .api import API
from .clock import SystemClock
from .identity import load_id, reconcile, write_private
from .model import Model, canonical
from .persistence import PostgresStore
from .runtime import Runtime
from .security import Tokens
from .testing.contract_types import type_registry

LOGGER = logging.getLogger(__name__)


class Options(Model):
    postgres_host: str
    postgres_port: int = Field(ge=1, le=65535)
    postgres_database: str
    postgres_user: str
    postgres_password: SecretStr
    postgres_sslmode: Literal["disable", "require", "verify-full"]
    postgres_ca: str
    installation_label: str
    initialize_empty_database: bool
    adopt_installation_id: str
    mqtt_mode: Literal["supervisor", "external", "disabled"]
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str
    mqtt_password: SecretStr
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"]
    log_format: Literal["text", "json"]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # No exception text, request bodies, configuration, or third-party credential URLs.
        return canonical(
            {
                "level": record.levelname,
                "event": record.msg,
                **{
                    k: record.__dict__[k]
                    for k in ("error_type", "reason", "contract_id", "installation_id", "epoch_id")
                    if k in record.__dict__
                },
            }
        )


async def connect_with_health(store: PostgresStore, runtime: Runtime, clock: SystemClock) -> bool:
    """Keep the bootstrap processor and liveness reachable while the DB is offline."""
    runtime.task = asyncio.create_task(runtime.run(), name="processor")
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stopped.set)

    async def health(request: web.Request) -> web.Response:
        # Receiving the request itself proves the event loop is progressing during bootstrap.
        runtime.last_heartbeat = clock.monotonic()
        if request.path.endswith("live"):
            return web.json_response({"live": runtime.live}, status=200 if runtime.live else 503)
        return web.json_response(
            {"ready": False, "reasons": ["persistence_initializing"]}, status=503
        )

    application = web.Application()
    application.router.add_get("/health/live", health)
    application.router.add_get("/health/ready", health)
    runner = web.AppRunner(application, access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", 8787).start()
    try:
        while not stopped.is_set():
            try:
                await store.open()
                return True
            except (OSError, ConnectionError, asyncpg.PostgresError) as error:
                LOGGER.warning("database_start_pending", extra={"error_type": type(error).__name__})
                await clock.sleep(2)
        runtime.task.cancel()
        await asyncio.gather(runtime.task, return_exceptions=True)
        return False
    finally:
        await runner.cleanup()


async def run(options: Options, data: Path, migrations: Path, frontend: Path) -> None:
    clock = SystemClock()
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonFormatter()
        if options.log_format == "json"
        else logging.Formatter("%(levelname)s %(message)s")
    )
    logging.basicConfig(level=options.log_level, handlers=[handler], force=True)
    logging.getLogger("aiohttp.access").disabled = True
    tls: ssl.SSLContext | bool = False
    if options.postgres_sslmode != "disable":
        tls = ssl.create_default_context(cafile=options.postgres_ca or None)
        if options.postgres_sslmode == "require":
            tls.check_hostname = False
            tls.verify_mode = ssl.CERT_NONE
    dsn = (
        f"postgresql://{quote(options.postgres_user, safe='')}:{quote(options.postgres_password.get_secret_value(), safe='')}"
        f"@{options.postgres_host}:{options.postgres_port}/{quote(options.postgres_database, safe='')}"
    )
    store = PostgresStore(dsn, migrations, tls=tls)
    runtime = Runtime(store, clock, type_registry())
    # A startup failure must not create a fake ready runtime or overwrite installation identity.
    if not await connect_with_health(store, runtime, clock):
        return
    try:
        installation_id = reconcile(
            load_id(data),
            await store.metadata("installation_id"),
            initialize_empty_database=options.initialize_empty_database,
            adopt_installation_id=options.adopt_installation_id or None,
        )
        await store.put_metadata("installation_id", installation_id)
        write_private(data / "installation.json", canonical({"installation_id": installation_id}))
        shutdown_file = data / "last_shutdown.json"
        if shutdown_file.exists():
            last = json.loads(shutdown_file.read_text(encoding="utf-8"))
            loaded = await store.load()
            if last["publication_seq"] > loaded.publication_seq:
                LOGGER.warning("database_older_than_last_shutdown")
        await runtime.start()
        tokens = Tokens(data / "secrets")
        api = API(
            runtime,
            tokens,
            installation_id,
            installation_label=options.installation_label,
            frontend=frontend,
        )
        consumer, ingress = (
            web.AppRunner(api.application(), access_log=None),
            web.AppRunner(api.application(ingress=True), access_log=None),
        )
        await consumer.setup()
        await ingress.setup()
        await web.TCPSite(consumer, "0.0.0.0", 8787).start()
        await web.TCPSite(ingress, "0.0.0.0", 8099).start()
        stopped = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, stopped.set)
        supervisor_token = os.environ.get("SUPERVISOR_TOKEN", "")
        LOGGER.info(
            "started",
            extra={"installation_id": installation_id, "epoch_id": runtime.state.epoch_id},
        )

        async def scheduler() -> None:
            while True:
                runtime.tick()
                await clock.sleep(0.5)

        async def health() -> None:
            while True:
                if runtime.task and runtime.task.done():
                    runtime.task.result()
                    raise RuntimeError("processor_stopped")
                if not runtime.persistence:
                    try:
                        await store.close()
                        await store.open()
                        if await store.metadata("installation_id") != installation_id:
                            raise ValueError("installation_mismatch")
                        await runtime.submit("recover")
                    except (OSError, ConnectionError, RuntimeError, asyncpg.PostgresError) as error:
                        LOGGER.warning(
                            "recovery_pending", extra={"error_type": type(error).__name__}
                        )
                await clock.sleep(2)

        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                bridge = BridgeAdapter(
                    runtime, session, "ws://supervisor/core/websocket", supervisor_token
                )
                mqtt = MQTTAdapter(
                    runtime,
                    session,
                    options.mqtt_mode,
                    {
                        "host": options.mqtt_host,
                        "port": options.mqtt_port,
                        "username": options.mqtt_username,
                        "password": options.mqtt_password.get_secret_value(),
                    },
                    supervisor_token,
                )
                async with asyncio.TaskGroup() as group:
                    tasks = [
                        group.create_task(bridge.run(), name="ha_adapter"),
                        group.create_task(mqtt.run(), name="mqtt_adapter"),
                        group.create_task(scheduler(), name="scheduler"),
                        group.create_task(clock.run(), name="clock"),
                        group.create_task(health(), name="health"),
                    ]
                    await stopped.wait()
                    for task in tasks:
                        task.cancel()
        finally:
            try:
                async with asyncio.timeout(25):
                    await runtime.stop()
                    write_private(
                        shutdown_file,
                        canonical(
                            {
                                "publication_seq": runtime.state.publication_seq,
                                "installation_id": installation_id,
                            }
                        ),
                    )
            finally:
                await consumer.cleanup()
                await ingress.cleanup()
        LOGGER.info("stopped")
    finally:
        if runtime.task and not runtime.task.done():
            runtime.task.cancel()
            await asyncio.gather(runtime.task, return_exceptions=True)
        await store.close()


def main() -> None:
    data = Path(os.environ.get("CORE_CONTRACTS_DATA", "/data"))
    try:
        options = Options.model_validate_json((data / "options.json").read_text(encoding="utf-8"))
        asyncio.run(run(options, data, Path("/app/migrations"), Path("/app/frontend")))
    except Exception as error:
        LOGGER.error("startup_failed", extra={"error_type": type(error).__name__})
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
