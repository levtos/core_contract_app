"""Executable Alpha 8 capacity budget, using only an owned throw-away test DB."""

import asyncio
import json
import os
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import asyncpg
from review_probe import configured, document, sample

from core_contracts.history import HistoryQuery
from core_contracts.persistence import MemoryStore, PostgresStore
from core_contracts.retention import RetentionPolicy

ROOT = Path(__file__).resolve().parents[1]


def p95(values):
    return round(sorted(values)[min(len(values) - 1, int(len(values) * 0.95))], 3)


async def graph_probe():
    config = document(1024)
    for contract in config["contracts"][1:]:
        contract["inputs"][0]["ref"] = "source.b"
    runtime = await configured(MemoryStore(), config)
    try:
        await runtime.submit("observation", sample(runtime, 1, "b"))
        times, counts = [], []
        for seq in range(2, 42):
            runtime.clock.advance(0.5)  # declared capacity: two total reports/s
            started = time.perf_counter()
            await runtime.submit("observation", sample(runtime, seq))
            times.append((time.perf_counter() - started) * 1000)
            counts.append(runtime.evaluation_stats)
        assert all(item["evaluated"] == 1 and item["reused"] == 1023 for item in counts)
        assert p95(times) < 500, times
        return dict(
            contracts=1024,
            reports_per_second=2,
            p95_transaction_ms=p95(times),
            budget_ms=500,
            evaluated=1,
            reused=1023,
        )
    finally:
        await runtime.stop()


async def database_probe():
    dsn = os.environ.get("TEST_DATABASE_DSN")
    if not dsn or not urlsplit(dsn).path.endswith("_test"):
        raise ValueError("isolated *_test database is required for the capacity proof")
    parts = urlsplit(dsn)
    admin = await asyncpg.connect(dsn, ssl=False)
    name = "alpha8_" + uuid4().hex + "_test"
    await admin.execute(f'CREATE DATABASE "{name}"')
    store = PostgresStore(
        urlunsplit(parts._replace(path="/" + name)), ROOT / "migrations", tls=False
    )
    runtime = None
    try:
        await store.open()
        runtime = await configured(store, document())
        writer = store.writer
        assert writer is not None
        template = sample(runtime, 1).storage_document()
        await runtime.stop()
        state = runtime.state
        runtime = None
        results, previous = [], 0
        for count in (100_000, 1_000_000):
            await writer.execute(
                """INSERT INTO source_observation_history(key,payload)
                   SELECT 'v2:scale:1:ha_state:'||n||':binding.a',
                          $1::jsonb || jsonb_build_object('ingest_seq',n,
                            'received_at',to_char('2025-12-01T00:00:00Z'::timestamptz+n*interval '0.5 second','YYYY-MM-DD"T"HH24:MI:SS.USOF'))
                   FROM generate_series($2::int,$3::int) n""",
                json.dumps(template),
                previous + 1,
                count,
                timeout=120,
            )
            previous = count
            await writer.execute("ANALYZE source_observation_history")
            await writer.execute("ANALYZE cc_observation_index")
            times, plans = {}, {}
            for label, query, args in (
                (
                    "evidence",
                    "SELECT payload FROM source_observation_history WHERE key=$1",
                    ("v2:scale:1:ha_state:50000:binding.a",),
                ),
                (
                    "latest",
                    "SELECT h.key,h.payload FROM cc_observation_index i JOIN source_observation_history h ON h.key=i.reference ORDER BY i.received_at DESC,i.reference DESC LIMIT 201",
                    (),
                ),
                (
                    "source_time",
                    "SELECT h.key,h.payload FROM cc_observation_index i JOIN source_observation_history h ON h.key=i.reference WHERE i.source_id=$1 AND i.received_at>=$2::timestamptz ORDER BY i.received_at DESC,i.reference DESC LIMIT 201",
                    (
                        "source.a",
                        datetime.fromisoformat(
                            template["received_at"].replace("2026-01-01", "2025-12-01")
                        ),
                    ),
                ),
            ):
                elapsed = []
                for _ in range(20):
                    started = time.perf_counter()
                    await writer.fetch(query, *args)
                    elapsed.append((time.perf_counter() - started) * 1000)
                times[label] = p95(elapsed)
                plans[label] = json.loads(
                    await writer.fetchval("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + query, *args)
                )[0]
                assert "Index" in str(plans[label]["Plan"]), plans[label]
                assert times[label] < 250, (label, times[label])
            page = await store.observation_history(HistoryQuery(source_id="source.a", limit=200))
            assert len(page["items"]) == 200 and page["next_cursor"]
            size = await writer.fetchval(
                "SELECT pg_total_relation_size('source_observation_history')+pg_total_relation_size('cc_observation_index')"
            )
            assert size < 2_000_000_000
            results.append(
                dict(
                    rows=count,
                    p95_ms=times,
                    query_budget_ms=250,
                    relation_and_index_bytes=size,
                    budget_bytes=2_000_000_000,
                    query_plans=plans,
                )
            )
        started = time.perf_counter()
        receipt = await store.maintain_history(
            state, runtime_now(), RetentionPolicy(raw_days=1, rollup_days=7)
        )
        assert receipt["selected"] == 1000
        assert await writer.fetchval("SELECT count(*) FROM source_observation_history") == 999_000
        assert (await store.rollups(HistoryQuery()))["items"]
        return dict(
            status="passed",
            horizons=dict(
                total_reports_per_second=2, raw_days=1, raw_rows_per_day=172800, rollup_days=7
            ),
            scales=results,
            retention_batch_ms=round((time.perf_counter() - started) * 1000, 3),
            receipt=receipt,
        )
    finally:
        if runtime is not None:
            await runtime.stop()
        await store.close()
        await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
        await admin.close()


def runtime_now():
    from datetime import UTC, datetime

    # Seed rows cover Dec 1-6; all are outside raw retention, inside rollup retention.
    return datetime(2025, 12, 7, tzinfo=UTC)


async def main():
    result = dict(graph=await graph_probe(), postgres=await database_probe())
    path = ROOT / "dist/alpha8-scale.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
