"""Repeatable five-fixture idle probe; uses a fake clock and database test double."""

import asyncio
import json
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path

from core_contracts.clock import FakeClock
from core_contracts.persistence import MemoryStore
from core_contracts.runtime import Runtime
from core_contracts.testing.contract_types import type_registry


async def main():
    store = MemoryStore()
    runtime = Runtime(store, FakeClock(datetime(2026, 1, 1, 12, tzinfo=UTC)), type_registry())
    await runtime.start()
    registry = json.loads(
        (
            Path(__file__).resolve().parents[1] / "docs/platform-alpha1/example-registry.json"
        ).read_text()
    )
    draft = await runtime.submit("draft_create", {"config": registry})
    await runtime.submit("activate", {**draft, "expected_active_revision": 0})
    samples, checkpoints = [], []
    for number in range(1, 1201):
        runtime.clock.advance(0.5)
        started = time.perf_counter()
        await runtime.submit("tick")
        elapsed = (time.perf_counter() - started) * 1000
        samples.append(elapsed)
        if number in (1, 100, 300, 600, 900, 1200):
            checkpoints.append(
                {
                    "ticks": number,
                    "sequence": runtime.state.publication_seq,
                    "history_rows": len(store.state.tables["contract_state_history"]),
                    "publications": len(store.state.publications),
                    "tick_ms": round(elapsed, 3),
                    "current_state_bytes": len(runtime.state.model_dump_json().encode()),
                }
            )
    print(
        json.dumps(
            {
                "checkpoints": checkpoints,
                "median_tick_ms": round(statistics.median(samples), 3),
                "p95_tick_ms": round(sorted(samples)[int(len(samples) * 0.95)], 3),
            },
            indent=2,
        )
    )
    await runtime.stop()


if __name__ == "__main__":
    asyncio.run(main())
