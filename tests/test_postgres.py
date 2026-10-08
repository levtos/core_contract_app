import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio

from core_contracts.clock import FakeClock
from core_contracts.persistence import PersistenceUnavailable, PostgresStore
from core_contracts.runtime import Runtime
from core_contracts.testing.contract_types import type_registry

from .conftest import activate
from .test_core import NOW
from .test_runtime import obs

pytestmark = pytest.mark.postgres
MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


@pytest_asyncio.fixture
async def database():
    dsn = os.environ.get("TEST_DATABASE_DSN")
    if not dsn:
        pytest.skip("environment: TEST_DATABASE_DSN / PostgreSQL unavailable")
    parsed = urlsplit(dsn)
    if not parsed.path.endswith("_test"):
        pytest.fail("TEST_DATABASE_DSN must name a dedicated *_test database")
    admin = await asyncpg.connect(dsn, ssl=False)
    name = "cc_test_" + uuid4().hex
    await admin.execute(f'CREATE DATABASE "{name}"')
    isolated = urlunsplit(parsed._replace(path="/" + name))
    try:
        yield isolated
    finally:
        await admin.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", name
        )
        await admin.execute(f'DROP DATABASE "{name}"')
        await admin.close()


async def test_postgres_restart_commit_failure_and_writer_lock(database, config):
    store = PostgresStore(database, MIGRATIONS, tls=False)
    await store.open()
    contender = PostgresStore(database, MIGRATIONS, tls=False)
    with pytest.raises(PersistenceUnavailable, match="writer_lock_unavailable"):
        await contender.open()
    runtime = Runtime(store, FakeClock(NOW), type_registry())
    await runtime.start()
    await activate(runtime, config)
    await runtime.submit("observation", obs(runtime))
    seq = runtime.state.publication_seq

    def crash():
        raise OSError("before commit")

    store.before_commit = crash
    with pytest.raises(OSError):
        await runtime.submit("observation", obs(runtime, False))
    assert runtime.state.publication_seq == seq
    store.before_commit = None
    runtime.task.cancel()
    import asyncio

    await asyncio.gather(runtime.task, return_exceptions=True)
    await store.close()
    await contender.open()
    restarted = Runtime(contender, runtime.clock, type_registry())
    await restarted.start()
    assert restarted.state.active_revision == 1
    assert (
        restarted.snapshot()["contracts"]["fixture.echo"]["fields"]["value"]["status"] == "unknown"
    )
    assert restarted.state.publication_seq == seq + 1
    await restarted.stop()
    await contender.close()


async def test_migration_checksum_and_newer_schema(database, tmp_path):
    migrations = tmp_path / "migrations"
    shutil.copytree(MIGRATIONS, migrations)
    store = PostgresStore(database, migrations, tls=False)
    await store.open()
    await store.close()
    path = migrations / "001_foundation.sql"
    original = path.read_text()
    path.write_text(original + "\n-- changed\n")
    with pytest.raises(ValueError, match="checksum"):
        await store.open()
    path.write_text(original)
    await store.open()
    await store.writer.execute("INSERT INTO cc_schema_migrations VALUES (99,'future')")
    await store.close()
    with pytest.raises(ValueError, match="newer_database_schema"):
        await store.open()


async def test_lock_loss_blocks_commit(database):
    store = PostgresStore(database, MIGRATIONS, tls=False)
    await store.open()
    state = await store.load()
    await store.writer.execute("SELECT pg_advisory_unlock_all()")
    with pytest.raises(PersistenceUnavailable, match="writer_lock_unavailable"):
        await store.commit(state)
    await store.close()


async def test_connection_loss_recovery(database, config):
    store = PostgresStore(database, MIGRATIONS, tls=False)
    await store.open()
    runtime = Runtime(store, FakeClock(NOW), type_registry())
    await runtime.start()
    await activate(runtime, config)
    epoch = runtime.state.epoch_id
    store.writer.terminate()
    with pytest.raises(PersistenceUnavailable):
        await runtime.submit("tick")
    assert not runtime.confirmed
    await store.close()
    await store.open()
    await runtime.submit("recover")
    assert runtime.state.epoch_id != epoch
    await runtime.stop()
    await store.close()


async def test_history_is_durable_bounded_ordered_and_not_loaded(database, config):
    store = PostgresStore(database, MIGRATIONS, tls=False)
    await store.open()
    runtime = Runtime(store, FakeClock(NOW), type_registry())
    await runtime.start()
    try:
        await activate(runtime, config)
        for number in range(110):
            runtime.clock.advance(1)
            await runtime.submit("observation", obs(runtime, number))
        loaded = await store.load()
        assert not loaded.tables["contract_state_history"] and not loaded.publications
        rows = await store.rows("contract_state_history", contract_id="fixture.echo")
        assert len(rows) == 100
        assert rows[0]["fields"]["value"]["value"] == 109
        assert [row["publication_seq"] for row in rows] == sorted(
            [row["publication_seq"] for row in rows], reverse=True
        )
        assert await store.writer.fetchval("SELECT count(*) FROM contract_state_history") == 111
        assert await store.writer.fetchval("SHOW tcp_keepalives_idle") == "15"
        assert await store.writer.fetchval("SHOW tcp_user_timeout") == "30000"
        assert await store.writer.fetchval("SHOW idle_session_timeout") == "1min"
    finally:
        await runtime.stop()
        await store.close()
