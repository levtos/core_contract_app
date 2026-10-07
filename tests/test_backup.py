import os
import subprocess
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest

from core_contracts.clock import FakeClock
from core_contracts.persistence import PostgresStore
from core_contracts.runtime import Runtime
from core_contracts.testing.contract_types import type_registry

from . import test_postgres
from .conftest import activate
from .test_core import NOW
from .test_postgres import MIGRATIONS

database = test_postgres.database

pytestmark = pytest.mark.postgres


async def test_pg_dump_restore(database, config):
    container = os.environ.get("PG_TEST_CONTAINER_ID")
    if not container:
        pytest.skip(
            "environment: PostgreSQL service container required for matching pg_dump/pg_restore"
        )
    store = PostgresStore(database, MIGRATIONS, tls=False)
    await store.open()
    runtime = Runtime(store, FakeClock(NOW), type_registry())
    await runtime.start()
    await activate(runtime, config)
    original_seq = runtime.state.publication_seq
    await runtime.stop()
    await store.close()
    parsed = urlsplit(database)
    name = parsed.path.removeprefix("/")
    restored_name = name + "_restored"
    control = await asyncpg.connect(database, ssl=False)
    await control.execute(f'CREATE DATABASE "{restored_name}"')
    try:
        dump = subprocess.run(
            ["docker", "exec", container, "pg_dump", "-U", parsed.username, "-Fc", name],
            capture_output=True,
            check=True,
        ).stdout
        subprocess.run(
            [
                "docker",
                "exec",
                "-i",
                container,
                "pg_restore",
                "-U",
                parsed.username,
                "--exit-on-error",
                "-d",
                restored_name,
            ],
            input=dump,
            capture_output=True,
            check=True,
        )
        restored = PostgresStore(
            urlunsplit(parsed._replace(path="/" + restored_name)), MIGRATIONS, tls=False
        )
        await restored.open()
        second = Runtime(restored, FakeClock(NOW), type_registry())
        await second.start()
        assert second.state.active_revision == 1
        assert second.state.publication_seq == original_seq + 1
        assert second.state.tables["history_gap"]
        await second.stop()
        await restored.close()
    finally:
        await control.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", restored_name
        )
        await control.execute(f'DROP DATABASE "{restored_name}"')
        await control.close()
