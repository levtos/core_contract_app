"""Local review harness for the Terra Workbench (no Home Assistant, no PostgreSQL).

Runs the *real* HTTP/WebSocket API and the real engine on the in-memory store and
serves the built frontend (``frontend/dist``) on the Ingress listener, so the UI can
be exercised against genuine API responses. It is a development aid only: it
activates nothing in a real installation, talks to no external system and keeps
nothing after it stops.

    cd frontend && npm ci && npm run build
    uv run python dev/workbench_demo.py --seed --port 8099
    # open http://127.0.0.1:8099/

``--seed`` activates docs/alpha4/example-registry.json through the public
draft/activate path and feeds two boolean sources so the cascade changes live.
"""

import argparse
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from aiohttp import web

from core_contracts.api import API
from core_contracts.clock import SystemClock
from core_contracts.evidence import Observation
from core_contracts.persistence import MemoryStore
from core_contracts.runtime import Runtime
from core_contracts.security import Tokens
from core_contracts.setup import Setup
from core_contracts.testing.contract_types import type_registry

ROOT = Path(__file__).resolve().parents[1]


class FinishedSetup(Setup):
    """Pretends the first-run assistant is complete; it exposes no setup mutation."""

    def status(self) -> dict[str, Any]:
        return {
            "phase": "completed",
            "database_configured": True,
            "onboarding_complete": True,
            "authority": "supervisor",
            "installation_id": "demo",
            "error": "",
            "restart_required": False,
            "csrf_token": self.csrf,
            "database": None,
        }

    async def dispatch(self, path: str, method: str, body: Any) -> Any:
        if path == "status" and method == "GET":
            return self.status()
        if path == "bridge" and method == "GET":
            return {"state": "active"}
        raise ValueError("invalid_setup_request")


def observation(runtime: Runtime, name: str, value: bool, seq: int) -> Observation:
    now = runtime.clock.now_utc()
    return Observation(
        source_id=f"source.{name}",
        binding_id=f"binding.{name}",
        adapter="ha_state",
        value_raw=value,
        observation_kind="live_change",
        ha_time_fired=now,
        received_at=now,
        epoch_id=runtime.state.epoch_id,
        ingest_seq=seq,
        registry_revision=runtime.state.active_revision,
        reference_version=2,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--port", type=int, default=8099)
    parser.add_argument("--seed", action="store_true", help="activate the Alpha-4 example registry")
    parser.add_argument("--frontend", type=Path, default=ROOT / "frontend" / "dist")
    args = parser.parse_args()

    clock = SystemClock()
    runtime = Runtime(MemoryStore(), clock, type_registry())
    await runtime.start()
    data = Path(tempfile.mkdtemp(prefix="terra-demo-"))
    api = API(
        runtime,
        Tokens(data / "secrets"),
        str(uuid4()),
        installation_label="Terra Workbench Demo (lokal, nicht produktiv)",
        ingress_address="127.0.0.1",
        frontend=args.frontend,
        setup=FinishedSetup(data, None),
    )
    runner = web.AppRunner(api.application(ingress=True), access_log=None)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", args.port).start()

    async def scheduler() -> None:
        while True:
            runtime.tick()
            await clock.sleep(0.5)

    tasks = [asyncio.create_task(scheduler())]
    if args.seed:
        document = json.loads((ROOT / "docs" / "alpha4" / "example-registry.json").read_text())
        draft = await runtime.submit("draft_create", {"config": document})
        await runtime.submit("activate", {**draft, "expected_active_revision": 0})
        runtime.first_snapshot = True

        async def feed() -> None:
            seq = 0
            flip = False
            while True:
                seq += 1
                flip = not flip
                await runtime.submit("observation", observation(runtime, "a", flip, seq))
                await runtime.submit("observation", observation(runtime, "b", not flip, seq + 1))
                await clock.sleep(8)

        tasks.append(asyncio.create_task(feed()))
    print(f"Workbench demo: http://127.0.0.1:{args.port}/  (in-memory, not a real installation)")
    try:
        await asyncio.Event().wait()
    finally:
        for task in tasks:
            task.cancel()
        await runner.cleanup()
        await runtime.stop()


if __name__ == "__main__":
    asyncio.run(main())
