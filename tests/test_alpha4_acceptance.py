"""G16 proposal: a complete synthetic cascade, authored exclusively as registry data."""

import copy
from datetime import timedelta
from uuid import uuid4

from core_contracts_client import CoreContractsClient

from core_contracts.api import API
from core_contracts.history import HistoryQuery
from core_contracts.runtime import Runtime
from core_contracts.security import Tokens
from core_contracts.testing.contract_types import type_registry

from .conftest import activate
from .test_declarative import definition, literal, machine_definition, schema
from .test_phase1a import add_source, contract, field, observation


def cascade(config):
    add_source(config, "b")
    truth = definition()
    truth["type_id"] = "test.truth"
    either = definition(
        dict(
            op="fusion",
            strategy="any_true",
            args=[dict(op="input", name="a"), dict(op="input", name="b")],
        )
    )
    either["type_id"] = "test.either"
    either["inputs"].append(dict(name="b", schema=schema()))
    condition = definition(
        dict(
            op="and",
            args=[
                dict(op="input", name="a"),
                dict(op="not", args=[literal(False)]),
                dict(
                    op="compare",
                    comparison="gt",
                    left=dict(
                        op="formula",
                        name="test.sum",
                        version=1,
                        args=[literal(1, "number"), literal(2, "number")],
                    ),
                    right=literal(2, "number"),
                ),
            ],
        )
    )
    condition["type_id"] = "test.condition"
    timed = definition(dict(op="ref", name="stable"))
    timed["type_id"] = "test.timed"
    timed["rules"] = {
        "grace": dict(
            op="temporal",
            id="grace",
            operation="grace",
            duration_s=10,
            args=[dict(op="input", name="a")],
        ),
        "stable": dict(
            op="temporal",
            id="stable",
            operation="stable_for",
            duration_s=2,
            accepts_held=True,
            args=[dict(op="ref", name="grace")],
        ),
    }
    machine = machine_definition()
    machine["type_id"] = "test.flow"
    machine["schema"]["fields"].update(
        {
            "truth": schema(),
            "count": schema("number"),
            "label": schema("text"),
            "stamp": schema("timestamp"),
            "metadata": schema("object"),
        }
    )
    machine["outputs"].update(
        {
            "truth": dict(op="input", name="a"),
            "count": literal(2, "number"),
            "label": literal("synthetic", "text"),
            "stamp": literal("2026-01-01T12:00:00+00:00", "timestamp"),
            "metadata": literal({"fixture": True}, "object"),
        }
    )
    config["definitions"] = [truth, either, condition, timed, machine]
    config["contracts"] = [
        contract("left", "truth", ["source.a"]),
        contract("right", "truth", ["source.b"]),
        contract("either", "either", ["fixture.left", "fixture.right"]),
        contract("condition", "condition", ["fixture.either"]),
        contract("timed", "timed", ["fixture.condition"]),
        contract("flow", "flow", ["fixture.timed"]),
    ]
    return config


async def exercise_cascade(runtime, config):
    report = await runtime.submit("validate", cascade(config))
    assert report["valid"]
    assert set(report["diff"]["added"]) == {c["contract_id"] for c in config["contracts"]}
    assert report["diff"]["analysis"] == "static"
    await activate(runtime, config)
    assert field(runtime, "either")["status"] == "unknown"
    await runtime.submit(
        "observation", observation(runtime, True, "b").model_copy(update={"ingest_seq": 1})
    )
    assert field(runtime, "either")["value"] is True
    assert field(runtime, "either")["quality"] == "degraded"
    assert "partial_evidence" in {r["code"] for r in field(runtime, "either")["reasons"]}
    runtime.clock.advance(2)
    await runtime.submit("tick")
    assert field(runtime, "timed")["value"] is True
    await runtime.submit(
        "observation", observation(runtime, False).model_copy(update={"ingest_seq": 2})
    )
    assert field(runtime, "either")["quality"] == "healthy"
    assert field(runtime, "flow", "truth")["value"] is True
    command = dict(
        command_id=str(uuid4()),
        contract_id="fixture.flow",
        command="start",
        args={"confirm": True},
        origin=dict(kind="test", actor="test", client_name="test"),
        issued_at=runtime.clock.now_utc(),
        valid_until=runtime.clock.now_utc() + timedelta(seconds=30),
    )
    result = await runtime.submit("command", command)
    assert result["status"] == "accepted"
    assert field(runtime, "flow")["value"] == "active"
    seq = runtime.state.publication_seq
    assert await runtime.submit("command", command) == result
    assert runtime.state.publication_seq == seq
    runtime.clock.advance(1)
    for index, name in enumerate(("a", "b"), 3):
        await runtime.submit(
            "observation",
            observation(runtime, None, name, availability="unavailable").model_copy(
                update={"ingest_seq": index}
            ),
        )
    assert field(runtime, "timed")["status"] == "held"
    return field(runtime, "timed")["held_until"], runtime.state.tables["sm_instance"][
        "fixture.flow"
    ]["deadline"]


async def test_data_only_cascade_full_manual_first_acceptance(
    runtime, config, aiohttp_server, tmp_path
):
    grace, deadline = await exercise_cascade(runtime, config)
    tokens, identity = Tokens(tmp_path), str(uuid4())
    server = await aiohttp_server(API(runtime, tokens, identity).application())
    async with CoreContractsClient(
        str(server.make_url("")), tokens.values["consumer"], identity
    ) as client:
        snapshot = await client.snapshot()
        assert snapshot.publication_seq == runtime.state.publication_seq
        stream = client.subscribe()
        service = await anext(stream)
        assert service["reasons"] == runtime.readiness_reasons
        subscribed = await anext(stream)
        assert subscribed["contracts"] == runtime.snapshot()["contracts"]
        await stream.aclose()
    traces = runtime.state.tables["node_state"]["fixture.flow"]["trace"]
    assert traces["steps"]
    assert (await runtime.store.history("command_log", HistoryQuery(contract_id="fixture.flow")))[
        "items"
    ]
    evidence = field(runtime, "timed")["evidence"]
    assert evidence and all([await runtime.store.evidence(ref) for ref in evidence])
    await runtime.stop()
    restarted = Runtime(runtime.store, runtime.clock, type_registry())
    await restarted.start()
    try:
        assert field(restarted, "timed")["held_until"] == grace
        assert restarted.state.tables["sm_instance"]["fixture.flow"]["deadline"] == deadline
        exported = restarted.config.model_dump(mode="json")
        assert (await restarted.submit("validate", exported))["valid"]
        changed = copy.deepcopy(exported)
        timed = next(d for d in changed["definitions"] if d["type_id"] == "test.timed")
        timed["type_version"] = 2
        timed["rules"]["grace"]["duration_s"] = 4
        next(c for c in changed["contracts"] if c["type_id"] == "test.timed")["type_version"] = 2
        report = await restarted.submit("validate", changed)
        assert set(report["diff"]["affected_contracts"]) == {"fixture.timed", "fixture.flow"}
        assert report["diff"]["transitively_affected_contracts"] == ["fixture.flow"]
        original_fp = restarted.state.tables["node_state"]["fixture.timed"]["fingerprint"]
        await activate(restarted, changed)
        assert restarted.state.tables["node_state"]["fixture.timed"]["fingerprint"] != original_fp
        assert (
            restarted.state.tables["contract_lifecycle"]["fixture.timed"]["start_case"]
            == "incompatible"
        )
        await restarted.submit("rollback", dict(revision=1, expected_active_revision=2))
        assert restarted.state.active_revision == 3
        assert restarted.config.definitions == runtime.config.definitions
        for table in (
            "contract_state_history",
            "source_observation_history",
            "sm_transition",
            "sm_episode",
            "deadline",
            "diagnostic_event",
        ):
            assert (await restarted.store.history(table, HistoryQuery(limit=2)))["items"]
        assert (await restarted.submit("validate", restarted.config.model_dump(mode="json")))[
            "valid"
        ]
    finally:
        await restarted.stop()
