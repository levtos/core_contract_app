"""ADR 0004: the admin escape hatch never invents sensor evidence or replay."""

import copy
from datetime import timedelta

import pytest
from pydantic import ValidationError

from core_contracts.declarative_models import DeclarativeDefinition
from core_contracts.manual_restart import RestartRequest
from core_contracts.model import checksum
from core_contracts.validation import RegistryValidationError

from .conftest import activate
from .test_declarative import literal, machine_definition, observation, registry
from .test_workbench_api import api_client

ACTOR = {"kind": "token", "role": "admin"}


async def setup_machine(runtime, config, *, enabled=True, recovery=False):
    definition = machine_definition()
    definition["machine"]["allow_manual_restart"] = enabled
    if not recovery:
        definition["machine"]["reinitialize_when"] = literal(False)
    document = registry(config, definition)
    await activate(runtime, document)
    return document


async def request_for(runtime, **patch):
    preview = await runtime.submit("manual_restart_preview", "fixture.echo")
    return {
        "command_id": "restart.1",
        "contract_id": "fixture.echo",
        "reason": "Synthetischer Test ohne Installation",
        "confirm": True,
        "issued_at": runtime.clock.now_utc().isoformat(),
        "valid_until": (runtime.clock.now_utc() + timedelta(seconds=30)).isoformat(),
        "expected_registry_revision": preview["registry_revision"],
        "expected_state_token": preview["state_token"],
        **patch,
    }


async def restart(runtime, request=None):
    return await runtime.submit(
        "manual_restart", {"request": request or await request_for(runtime), "_actor": ACTOR}
    )


def machine(runtime):
    return runtime.snapshot()["contracts"]["fixture.echo"]["state_machine"]


async def test_default_off_historical_fingerprint_and_version_immutability(runtime, config):
    definition = machine_definition()
    before = DeclarativeDefinition.model_validate(definition).model_dump(mode="json")
    assert "allow_manual_restart" not in before["machine"]
    definition["machine"]["allow_manual_restart"] = False
    assert checksum(DeclarativeDefinition.model_validate(definition)) == checksum(before)
    await activate(runtime, registry(config, definition))
    preview = await runtime.submit("manual_restart_preview", "fixture.echo")
    assert not preview["allowed"] and preview["reason"] == "restart_not_enabled"
    assert (await restart(runtime))["reason"] == "restart_not_enabled"
    definition["machine"]["allow_manual_restart"] = True
    with pytest.raises(RegistryValidationError) as error:
        await runtime.submit("validate", registry(config, definition))
    assert error.value.issues[0].code == "immutable_definition_version"
    definition["type_version"] = 2
    await activate(runtime, registry(config, definition))
    assert (await runtime.submit("manual_restart_preview", "fixture.echo"))["allowed"]


async def test_admin_only_preview_write_and_unspoofable_identity(
    runtime, config, aiohttp_client, tmp_path
):
    await setup_machine(runtime, config)
    api, client, headers = await api_client(runtime, aiohttp_client, tmp_path)
    body = await request_for(runtime)
    for role in ("consumer",):
        unauthorized = {"Authorization": "Bearer " + api.tokens.values[role]}
        assert (
            await client.get("/api/v1/manual-restarts/preview/fixture.echo", headers=unauthorized)
        ).status == 403
        assert (
            await client.post("/api/v1/manual-restarts", headers=unauthorized, json=body)
        ).status == 403
    assert (await client.post("/api/v1/manual-restarts", json=body)).status == 401
    for forbidden in ({"target_state": "done"}, {"origin": {"kind": "admin"}}, {"_actor": ACTOR}):
        assert (
            await client.post(
                "/api/v1/manual-restarts", headers=headers, json={**body, **forbidden}
            )
        ).status == 400
    assert (
        await client.get("/api/v1/manual-restarts/preview/fixture.echo", headers=headers)
    ).status == 200
    result = await (await client.post("/api/v1/manual-restarts", headers=headers, json=body)).json()
    assert result["status"] == "accepted"
    audit = [
        row
        for row in await runtime.store.rows("diagnostic_event")
        if row.get("operation") == "manual_restart"
    ]
    assert len(audit) == 1 and audit[0]["actor"] == ACTOR
    assert audit[0]["reason"] == body["reason"] and audit[0]["origin"] == "manual"


async def test_impact_new_episode_command_audit_envelope_and_ws_are_one_commit(runtime, config):
    document = await setup_machine(runtime, config)
    document["contracts"].extend(
        [
            {
                "contract_id": "direct",
                "type_id": "test.echo",
                "type_version": 1,
                "enabled": True,
                "inputs": [{"name": "a", "ref": "fixture.echo"}],
                "parameters": {},
            },
            {
                "contract_id": "indirect",
                "type_id": "test.echo",
                "type_version": 1,
                "enabled": True,
                "inputs": [{"name": "a", "ref": "direct"}],
                "parameters": {},
            },
        ]
    )
    await activate(runtime, document)
    preview = await runtime.submit("manual_restart_preview", "fixture.echo")
    assert preview["direct_contracts"] == ["direct"] and preview["indirect_contracts"] == [
        "indirect"
    ]
    assert preview["external_automations_known"] is False
    previous = machine(runtime)["episode_id"] if machine(runtime) else None
    queue = runtime.subscribe()
    result = await restart(runtime)
    current = machine(runtime)
    assert result["status"] == "accepted" and result["episode_id"] != previous
    assert (
        current["state"] == "idle" and current["origin"] == "manual" and current["manual_restart"]
    )
    assert current["episode_id"] == result["episode_id"] and not current["evidence"]
    envelope = runtime.snapshot()["contracts"]["fixture.echo"]
    assert not envelope["available"] and envelope["contract_health"] == "degraded"
    assert envelope["fields"]["value"]["reasons"][0]["code"] == "manual_restart"
    frames = []
    while not queue.empty():
        frames.append(queue.get_nowait())
    assert any("manual_restart" in str(frame) for frame in frames)
    assert (await runtime.store.get("command_log", result["command_id"]))["result"] == result
    assert (await runtime.store.get("sm_episode", result["episode_id"]))["origin"] == "manual"
    if previous:
        assert (await runtime.store.get("sm_episode", previous))["episode_ended_at"]
    runtime.subscribers.discard(queue)


async def test_idempotency_conflict_and_restore_never_repeat_the_restart(runtime, config):
    await setup_machine(runtime, config)
    body = await request_for(runtime)
    result = await restart(runtime, body)
    assert await restart(runtime, body) == result
    assert (await restart(runtime, {**body, "reason": "Andere Begründung"}))[
        "status"
    ] == "command_id_conflict"
    await runtime.submit("recover")
    assert machine(runtime)["episode_id"] == result["episode_id"]
    assert machine(runtime)["manual_restart"]
    assert await restart(runtime, body) == result
    episodes = await runtime.store.rows("sm_episode")
    assert sum(row["episode_id"] == result["episode_id"] for row in episodes) == 1
    audits = [
        row
        for row in await runtime.store.rows("diagnostic_event")
        if row.get("operation") == "manual_restart"
    ]
    assert len(audits) == 1


@pytest.mark.parametrize("case", ["expired", "future", "unconfirmed", "revision", "state"])
async def test_invalid_confirmation_expiry_revision_and_state_are_rejected(runtime, config, case):
    await setup_machine(runtime, config)
    body = await request_for(runtime)
    old = copy.deepcopy(machine(runtime))
    if case == "expired":
        runtime.clock.advance(31)
    elif case == "future":
        body["issued_at"] = (runtime.clock.now_utc() + timedelta(seconds=1)).isoformat()
    elif case == "unconfirmed":
        body["confirm"] = False
    elif case == "revision":
        body["expected_registry_revision"] += 1
    else:
        body["expected_state_token"] = "0" * 64
    result = await restart(runtime, body)
    assert result["status"] == ("expired" if case == "expired" else "rejected")
    assert machine(runtime) == old


async def test_commit_failure_does_not_change_episode_publish_or_record_success(runtime, config):
    await setup_machine(runtime, config)
    previous = copy.deepcopy(runtime.snapshot()["contracts"])
    sequence = runtime.state.publication_seq
    body = await request_for(runtime)
    runtime.store.before_commit = lambda: (_ for _ in ()).throw(OSError("synthetic failure"))
    with pytest.raises(OSError):
        await restart(runtime, body)
    assert runtime.snapshot()["contracts"] == previous
    assert runtime.state.publication_seq == sequence
    assert await runtime.store.get("command_log", body["command_id"]) is None
    assert not [
        row
        for row in await runtime.store.rows("diagnostic_event")
        if row.get("operation") == "manual_restart"
    ]
    runtime.store.before_commit = None
    await runtime.submit("recover")
    assert (await restart(runtime, await request_for(runtime)))["status"] == "accepted"


async def test_valid_input_transition_confirms_manual_state_but_invalid_data_does_not(
    runtime, config
):
    data = machine_definition()
    data["machine"]["allow_manual_restart"] = True
    data["machine"]["reinitialize_when"] = literal(False)
    data["machine"]["transitions"][0].update(event="input", argument_equals={})
    await activate(runtime, registry(config, data))
    await restart(runtime)
    for extra in ({"availability": "unknown"}, {"observation_kind": "restore"}):
        runtime.clock.advance(1)
        await runtime.submit("observation", observation(runtime, True).model_copy(update=extra))
        assert machine(runtime)["manual_restart"] and machine(runtime)["state"] == "idle"
    runtime.clock.advance(1)
    await runtime.submit("observation", observation(runtime, True))
    assert not machine(runtime).get("manual_restart", False)
    assert machine(runtime)["state"] == "active" and machine(runtime)["origin"] == "automatic"
    assert runtime.snapshot()["contracts"]["fixture.echo"]["contract_health"] == "healthy"


async def test_declared_recovery_needs_real_evidence_and_clears_manual_marker(runtime, config):
    await setup_machine(runtime, config, recovery=True)
    result = await restart(runtime)
    runtime.clock.advance(1)
    await runtime.submit("observation", observation(runtime, False))
    assert machine(runtime)["manual_restart"]
    runtime.clock.advance(1)
    await runtime.submit("observation", observation(runtime, True))
    current = machine(runtime)
    assert not current.get("manual_restart", False) and current["origin"] == "automatic"
    assert current["episode_id"] != result["episode_id"] and current["evidence"]


async def test_constants_deadlines_and_normal_commands_do_not_confirm_manual_restart(
    runtime, config
):
    data = machine_definition()
    data["machine"]["allow_manual_restart"] = True
    data["machine"]["reinitialize_when"] = literal(True)  # no decisive evidence
    data["machine"]["transitions"][0]["guard"] = literal(True)
    await activate(runtime, registry(config, data))
    await restart(runtime)
    command = {
        "command_id": "normal",
        "contract_id": "fixture.echo",
        "command": "start",
        "args": {"confirm": True},
        "origin": {"kind": "test", "actor": "test", "client_name": "test"},
        "issued_at": runtime.clock.now_utc(),
        "valid_until": runtime.clock.now_utc() + timedelta(seconds=30),
    }
    assert (await runtime.submit("command", command))["status"] == "accepted"
    assert machine(runtime)["manual_restart"] and machine(runtime)["state"] == "active"
    runtime.clock.advance(11)
    await runtime.submit("tick")
    assert machine(runtime)["manual_restart"] and machine(runtime)["state"] == "done"
    await runtime.submit("observation", observation(runtime, False))
    assert machine(runtime)["manual_restart"]


async def test_disabled_contract_and_missing_internal_admin_are_rejected(runtime, config):
    document = await setup_machine(runtime, config)
    document["contracts"][0]["enabled"] = False
    await activate(runtime, document)
    assert (await restart(runtime))["reason"] == "contract_disabled"
    with pytest.raises(ValueError, match="admin_required"):
        await runtime.submit("manual_restart", {"request": await request_for(runtime)})


@pytest.mark.parametrize(
    "patch",
    [
        {"confirm": "true"},
        {"expected_registry_revision": True},
        {"reason": "   "},
        {"target_state": "done"},
    ],
)
async def test_strict_complete_request_cannot_forge_confirmation_or_select_target(
    runtime, config, patch
):
    await setup_machine(runtime, config)
    with pytest.raises(ValidationError):
        RestartRequest.model_validate({**await request_for(runtime), **patch})


async def test_failed_producer_discards_all_proposed_restart_effects(runtime, config, monkeypatch):
    await setup_machine(runtime, config)
    previous = copy.deepcopy(runtime.snapshot()["contracts"])
    sequence = runtime.state.publication_seq
    evaluate = runtime._evaluate

    def failed(state, candidate, **options):
        failures = evaluate(state, candidate, **options)
        if options.get("machine_override"):
            # Model an evaluator that staged work before reporting the target failure.
            failures.add("fixture.echo")
        return failures

    monkeypatch.setattr(runtime, "_evaluate", failed)
    result = await restart(runtime)
    assert result["status"] == "rejected" and result["reason"] == "evaluation_error"
    assert runtime.snapshot()["contracts"] == previous
    assert runtime.state.publication_seq == sequence
    assert (await runtime.store.get("command_log", "restart.1"))["result"] == result
    assert not [row for row in await runtime.store.rows("sm_episode") if row.get("manual_restart")]
