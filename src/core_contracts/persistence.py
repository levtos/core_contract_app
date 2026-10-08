"""Dedicated, locked PostgreSQL writer and atomic platform changesets."""

import asyncio
import copy
import hashlib
import json
import logging
import ssl
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

import asyncpg
from pydantic import BaseModel, Field

from .model import canonical

TABLES = (
    "runtime_epoch",
    "registry_revision",
    "registry_activation",
    "registry_draft",
    "contract_lifecycle",
    "contract_state_current",
    "contract_state_history",
    "source_observation_current",
    "source_observation_history",
    "node_state",
    "sm_instance",
    "sm_episode",
    "sm_transition",
    "deadline",
    "command_log",
    "history_gap",
    "diagnostic_event",
)
IMMUTABLE = {
    "registry_revision",
    "registry_activation",
    "contract_state_history",
    "source_observation_history",
    "sm_transition",
    "history_gap",
    "diagnostic_event",
}
LOCK_ID = 1128484913
LOGGER = logging.getLogger(__name__)
# Historical rows are transaction append/upsert buffers, never a runtime cache.
ARCHIVE = IMMUTABLE | {"command_log", "sm_episode", "deadline", "runtime_epoch"}


class PersistenceUnavailable(RuntimeError):
    pass


def empty_tables() -> dict[str, dict[str, dict[str, Any]]]:
    return {table: {} for table in TABLES}


class State(BaseModel):
    generation: int = 0
    active_revision: int = 0
    publication_seq: int = 0
    epoch_id: str = ""
    tables: dict[str, dict[str, dict[str, Any]]] = Field(default_factory=empty_tables)
    publications: dict[int, dict[str, Any]] = Field(default_factory=dict)

    def clone(self) -> State:
        return State(
            generation=self.generation,
            active_revision=self.active_revision,
            publication_seq=self.publication_seq,
            epoch_id=self.epoch_id,
            tables={name: copy.deepcopy(rows) for name, rows in self.current_tables().items()},
        )

    def current_tables(self) -> dict[str, dict[str, dict[str, Any]]]:
        result = {}
        for name, rows in self.tables.items():
            key = str(self.active_revision) if name == "registry_revision" else self.epoch_id
            if name in {"registry_revision", "runtime_epoch"}:
                result[name] = {key: rows[key]} if key in rows else {}
            else:
                result[name] = {} if name in ARCHIVE else rows
        return result

    def compact(self) -> None:
        self.tables = self.current_tables()
        self.publications = {}


class Store(Protocol):
    async def load(self) -> State: ...
    async def commit(self, state: State) -> None: ...
    async def probe(self) -> None: ...
    async def close(self) -> None: ...
    async def get(self, table: str, key: str) -> dict[str, Any] | None: ...
    async def rows(
        self, table: str, *, contract_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]: ...


class PostgresStore:
    def __init__(self, dsn: str, migrations: Path, *, tls: ssl.SSLContext | bool = True) -> None:
        self.dsn = dsn
        self.migrations = migrations
        self.tls = tls
        self.writer: asyncpg.Connection[Any] | None = None
        self.pool: asyncpg.Pool[Any] | None = None
        self._committed = State()
        self.before_commit: Callable[[], None] | None = None
        self._mutex = asyncio.Lock()

    async def open(self) -> None:
        connection = await asyncpg.connect(
            self.dsn,
            ssl=self.tls,
            timeout=10,
            command_timeout=10,
            server_settings={
                "tcp_keepalives_idle": "15",
                "tcp_keepalives_interval": "5",
                "tcp_keepalives_count": "3",
                "tcp_user_timeout": "30000",
                "idle_session_timeout": "60000",
                "idle_in_transaction_session_timeout": "15000",
                "application_name": "core_contracts_writer",
            },
        )
        try:
            if not await connection.fetchval("SELECT pg_try_advisory_lock($1)", LOCK_ID):
                owner = await connection.fetchval(
                    "SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND classid=0 AND granted LIMIT 1",
                    LOCK_ID,
                )
                LOGGER.warning("writer_lock_unavailable", extra={"writer_pid": owner})
                raise PersistenceUnavailable("writer_lock_unavailable")
            self.writer = connection
            await self.migrate()
            self.pool = await asyncpg.create_pool(
                self.dsn, ssl=self.tls, min_size=1, max_size=2, timeout=10, command_timeout=10
            )
            LOGGER.info("writer_lock_acquired")
        except BaseException:
            await connection.close()
            self.writer = None
            raise

    async def migrate(self) -> None:
        connection = self._writer()
        await connection.execute(
            "CREATE TABLE IF NOT EXISTS cc_schema_migrations "
            "(version integer PRIMARY KEY, checksum text NOT NULL)"
        )
        known = {int(p.name.split("_")[0]): p for p in self.migrations.glob("[0-9]*.sql")}
        if not known or sorted(known) != list(range(1, max(known) + 1)):
            raise ValueError("invalid migration sequence")
        applied = {
            row["version"]: row["checksum"]
            for row in await connection.fetch("SELECT version, checksum FROM cc_schema_migrations")
        }
        if applied.keys() - known.keys():
            raise ValueError("newer_database_schema")
        for version, path in sorted(known.items()):
            sql = path.read_text(encoding="utf-8").replace("\r\n", "\n")
            digest = hashlib.sha256(sql.encode()).hexdigest()
            if version in applied:
                if digest != applied[version]:
                    raise ValueError("migration_checksum_mismatch")
                continue
            async with connection.transaction():
                await connection.execute(sql)
                await connection.execute(
                    "INSERT INTO cc_schema_migrations VALUES ($1, $2)", version, digest
                )
            LOGGER.info("migration_applied", extra={"revision": version})

    def _writer(self) -> asyncpg.Connection[Any]:
        if self.writer is None or self.writer.is_closed():
            raise PersistenceUnavailable("persistence_unavailable")
        return self.writer

    async def probe(self) -> None:
        connection = self._writer()
        held = await connection.fetchval(
            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' "
            "AND pid=pg_backend_pid() AND objid=$1 AND classid=0 AND objsubid=1 AND granted)",
            LOCK_ID,
        )
        if not held:
            raise PersistenceUnavailable("writer_lock_unavailable")

    async def metadata(self, key: str) -> Any:
        value = await self._writer().fetchval("SELECT value FROM cc_meta WHERE key=$1", key)
        return json.loads(value) if value is not None else None

    async def put_metadata(self, key: str, value: Any) -> None:
        await self.probe()
        await self._writer().execute(
            "INSERT INTO cc_meta VALUES ($1,$2::jsonb) "
            "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
            key,
            canonical(value),
        )

    async def load(self) -> State:
        await self.probe()
        connection = self._writer()
        async with connection.transaction(isolation="repeatable_read", readonly=True):
            state = State.model_validate(await self.metadata("runtime") or {})
            for table in TABLES:
                if table == "registry_revision":
                    rows = await connection.fetch(
                        f"SELECT key,payload FROM {table} WHERE key=$1", str(state.active_revision)
                    )
                elif table == "runtime_epoch":
                    rows = await connection.fetch(
                        f"SELECT key,payload FROM {table} WHERE key=$1", state.epoch_id
                    )
                elif table in ARCHIVE:
                    continue
                else:
                    rows = await connection.fetch(f"SELECT key,payload FROM {table}")
                state.tables[table] = {row["key"]: json.loads(row["payload"]) for row in rows}
        self._committed = state.clone()
        return state

    async def commit(self, state: State) -> None:
        async with self._mutex:
            await self.probe()
            connection = self._writer()
            previous = self._committed
            if state.generation != previous.generation:
                raise ValueError("stale changeset")
            async with connection.transaction():
                for table in TABLES:
                    old, new = previous.tables[table], state.tables[table]
                    for key in old.keys() - new.keys():
                        if table in ARCHIVE:
                            continue
                        await connection.execute(f"DELETE FROM {table} WHERE key=$1", key)
                    for key, value in new.items():
                        if old.get(key) == value:
                            continue
                        if key in old and table in IMMUTABLE:
                            raise ValueError("immutable history")
                        suffix = (
                            ""
                            if table in IMMUTABLE
                            else " ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload"
                        )
                        await connection.execute(
                            f"INSERT INTO {table} VALUES ($1,$2::jsonb)" + suffix,
                            key,
                            canonical(value),
                        )
                for seq in state.publications.keys() - previous.publications.keys():
                    payload = state.publications[seq]
                    await connection.execute(
                        "INSERT INTO publication VALUES ($1,$2,$3::jsonb)",
                        seq,
                        datetime.fromisoformat(payload["created_at"]),
                        canonical(payload),
                    )
                metadata = state.model_dump(exclude={"tables", "publications"})
                metadata["generation"] += 1
                await self.put_metadata("runtime", metadata)
                if self.before_commit:
                    self.before_commit()
            state.generation += 1
            state.compact()
            self._committed = state.clone()

    async def get(self, table: str, key: str) -> dict[str, Any] | None:
        if table not in TABLES or self.pool is None:
            raise PersistenceUnavailable("persistence_unavailable")
        value = await self.pool.fetchval(f"SELECT payload FROM {table} WHERE key=$1", key)
        return json.loads(value) if value is not None else None

    async def rows(
        self, table: str, *, contract_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        if table not in TABLES or self.pool is None:
            raise PersistenceUnavailable("persistence_unavailable")
        order = (
            "(payload->>'publication_seq')::bigint"
            if table == "contract_state_history"
            else "(payload->>'revision')::bigint"
            if table == "registry_revision"
            else "COALESCE(payload->>'at',payload->>'created_at',payload->>'updated_at','')"
        )
        records = await self.pool.fetch(
            f"SELECT payload FROM {table} WHERE ($1::text IS NULL OR payload->>'contract_id'=$1) ORDER BY {order} DESC, key DESC LIMIT $2",
            contract_id,
            min(max(limit, 1), 1000),
        )
        return [json.loads(row["payload"]) for row in records]

    async def close(self) -> None:
        if self.pool:
            try:
                async with asyncio.timeout(3):
                    await self.pool.close()
            except TimeoutError:
                LOGGER.warning("reader_pool_close_timeout")
                self.pool.terminate()
            self.pool = None
        if self.writer and not self.writer.is_closed():
            await self.writer.close(timeout=3)  # Session lock is released by PostgreSQL.
        self.writer = None


class MemoryStore:
    """Transactional test double only; the application always constructs PostgresStore."""

    def __init__(self) -> None:
        self.state = State()
        self.available = True
        self.locked = True
        self.before_commit: Callable[[], None] | None = None

    async def probe(self) -> None:
        if not self.available or not self.locked:
            raise PersistenceUnavailable("persistence_unavailable")

    async def load(self) -> State:
        await self.probe()
        return self.state.clone()

    async def commit(self, state: State) -> None:
        await self.probe()
        if state.generation != self.state.generation:
            raise ValueError("stale changeset")
        if self.before_commit:
            self.before_commit()
        for table, rows in state.tables.items():
            if table not in ARCHIVE:
                self.state.tables[table] = copy.deepcopy(rows)
            else:
                self.state.tables[table].update(copy.deepcopy(rows))
        self.state.publications.update(copy.deepcopy(state.publications))
        state.generation += 1
        for name in ("generation", "active_revision", "publication_seq", "epoch_id"):
            setattr(self.state, name, getattr(state, name))
        state.compact()

    async def get(self, table: str, key: str) -> dict[str, Any] | None:
        await self.probe()
        return copy.deepcopy(self.state.tables[table].get(key))

    async def rows(
        self, table: str, *, contract_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        await self.probe()
        records = [
            v
            for v in self.state.tables[table].values()
            if contract_id is None or v.get("contract_id") == contract_id
        ]
        key = (
            "publication_seq"
            if table == "contract_state_history"
            else "revision"
            if table == "registry_revision"
            else "at"
        )
        return copy.deepcopy(
            sorted(
                records,
                key=lambda row: row.get(key, row.get("created_at", row.get("updated_at", ""))),
                reverse=True,
            )[:limit]
        )

    async def close(self) -> None:
        self.locked = False
