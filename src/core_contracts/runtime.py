"""One serial authority: stage, evaluate, commit, then make results visible."""

import asyncio
import copy
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from pydantic import field_validator

from .clock import Clock
from .evidence import Observation, assess, is_new
from .model import Model, canonical, checksum, utc
from .persistence import State, Store
from .quality import FieldValue, ReasonCode, unknown
from .registry import (
    Contract,
    RegistryConfig,
    diff,
    fingerprints,
    resolve_ref,
    topological,
    validate,
)
from .resolver import Bucket
from .schema import Envelope, TypeRegistry, validate_fields
from .statemachine import MachineState
from .temporal import start_case

LOGGER = logging.getLogger(__name__)


class Command(Model):
    command_id: str
    contract_id: str
    command: str
    args: dict[str, Any]
    origin: dict[str, str]
    issued_at: datetime
    valid_until: datetime
    expected_registry_revision: int | None = None

    _times = field_validator("issued_at", "valid_until")(utc)


@dataclass
class Work:
    operation: str
    payload: Any
    future: asyncio.Future[Any] | None = None


class Runtime:
    def __init__(
        self, store: Store, clock: Clock, types: TypeRegistry, *, queue_size: int = 256
    ) -> None:
        self.store, self.clock, self.types = store, clock, types
        self.state = State()
        self.queue: asyncio.Queue[Work] = asyncio.Queue(queue_size)
        self.task: asyncio.Task[None] | None = None
        self.confirmed = False
        self.persistence = False
        self.first_snapshot = False
        self.bridge = "disconnected"
        self.ha = "disconnected"
        self.mqtt = "disabled"
        self.latest: dict[str, Observation] = {}
        self.overflow = False
        self.resubscribe = asyncio.Event()
        self.revision_changed = asyncio.Event()
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self.latches: dict[str, Bucket] = {}
        self.pending_latches: dict[str, Bucket] | None = None
        self.stopping = False
        self.commit_duration = 0.0
        self.last_heartbeat = clock.monotonic()

    @property
    def config(self) -> RegistryConfig | None:
        return self._config(self.state)

    @staticmethod
    def _config(state: State) -> RegistryConfig | None:
        revision = state.tables["registry_revision"].get(str(state.active_revision))
        return RegistryConfig.model_validate(revision["config"]) if revision else None

    def service_state(self) -> dict[str, Any]:
        return {
            "type": "service_state",
            "ready": self.ready,
            "publication_confirmed": self.confirmed,
            "persistence": "available" if self.persistence else "persistence_unavailable",
            "ha": self.ha,
            "bridge": self.bridge,
            "mqtt": self.mqtt,
        }

    @property
    def live(self) -> bool:
        return (
            self.task is not None
            and not self.task.done()
            and self.clock.monotonic() - self.last_heartbeat < 5
        )

    @property
    def ready(self) -> bool:
        return self.persistence and self.state.active_revision > 0 and self.first_snapshot

    async def start(self) -> None:
        self.state = await self.store.load()
        self.persistence = True
        await self._restore("process_restart")
        self.task = asyncio.create_task(self.run(), name="processor")

    def _gap(self, state: State, reason: str) -> None:
        key = str(uuid4())
        state.tables["history_gap"][key] = {
            "reason": reason,
            "at": self.clock.now_utc().isoformat(),
            "epoch_id": state.epoch_id,
        }
        LOGGER.warning("history_gap", extra={"reason": reason})

    async def _restore(self, reason: str) -> None:
        state = self.state.clone()
        old_epoch = state.epoch_id
        state.epoch_id = str(uuid4())
        if old_epoch:
            self._gap(state, reason)
        state.tables["runtime_epoch"][state.epoch_id] = {
            "started_at": self.clock.now_utc().isoformat(),
            "ended_at": None,
        }
        self.latches = {}
        if reason == "process_restart":
            for observation in state.tables["source_observation_current"].values():
                observation["observation_kind"] = "restore"
        for node in state.tables["node_state"].values():
            if "temporal" in node:
                node["restore_pending"] = copy.deepcopy(node["temporal"])
        config = self._config(state)
        if config:
            self._evaluate(state, config, origin="restore")
        await self._commit(state, publication=bool(config), resync=True)

    async def submit(self, operation: str, payload: Any = None) -> Any:
        if self.stopping:
            raise RuntimeError("going_away")
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        await self.queue.put(Work(operation, payload, future))
        return await asyncio.shield(future)

    def ingest(self, observation: Observation) -> None:
        if self.stopping:
            return
        if not self.persistence:
            self.latest[observation.binding_id] = observation
            return
        try:
            self.queue.put_nowait(Work("observation", observation))
        except asyncio.QueueFull:
            self.latest[observation.binding_id] = observation
            self.overflow = True
            self.resubscribe.set()

    def tick(self) -> None:
        self.last_heartbeat = self.clock.monotonic()
        if not self.queue.full() and not self.stopping:
            self.queue.put_nowait(Work("tick", None))

    async def run(self) -> None:
        while True:
            work = await self.queue.get()
            try:
                result = await self.process(work.operation, work.payload)
                if work.future and not work.future.done():
                    work.future.set_result(result)
            except Exception as error:
                LOGGER.error(
                    "processor_request_failed",
                    extra={"operation": work.operation, "error_type": type(error).__name__},
                )
                if work.future and not work.future.done():
                    work.future.set_exception(error)
            finally:
                self.queue.task_done()

    async def process(self, operation: str, payload: Any) -> Any:
        if operation == "recover":
            self.state = await self.store.load()
            self.persistence = True
            for observation in self.state.tables["source_observation_current"].values():
                observation["observation_kind"] = "restore"
            # Coalesced outage input is snapshot evidence, never replayed as events.
            for obs in self.latest.values():
                self.state.tables["source_observation_current"][obs.binding_id] = obs.model_copy(
                    update={"observation_kind": "snapshot"}
                ).model_dump(mode="json")
            self.latest.clear()
            await self._restore("db_outage")
            self.resubscribe.set()
            return None
        if operation == "bridge_state":
            self.bridge, self.ha = payload
            self._broadcast(self.service_state())
            if self.bridge == "unavailable" and self.persistence and self.config:
                staged = self.state.clone()
                for binding in self.config.bindings:
                    if binding.adapter.kind.startswith("ha_"):
                        current_observation = staged.tables["source_observation_current"].get(
                            binding.binding_id
                        )
                        if current_observation:
                            current_observation["availability"] = "unavailable"
                self._evaluate(staged, self.config, origin="revision")
                await self._commit(staged, publication=True)
            return None
        if operation == "mqtt_state":
            self.mqtt = str(payload)
            self._broadcast(self.service_state())
            return None
        if operation == "snapshot_complete":
            self.first_snapshot = True
            self._broadcast(self.service_state())
            return None
        if not self.persistence:
            if operation == "tick":
                return None
            if operation == "observation":
                self.latest[payload.binding_id] = payload
                return None
            raise RuntimeError("persistence_unavailable")
        state = self.state.clone()
        now = self.clock.now_utc()
        config = self._config(state)
        if self.overflow:
            self._gap(state, "ingest_overflow")
            for obs in self.latest.values():
                state.tables["source_observation_current"][obs.binding_id] = obs.model_copy(
                    update={"observation_kind": "snapshot"}
                ).model_dump(mode="json")
            self.latest.clear()
            self.overflow = False
        if operation in {"draft_create", "draft_update"}:
            document = payload["config"]
            # Drafts can be incomplete, but cannot carry credentials or invalid JSON.
            from .registry import safe_document

            safe_document(document)
            if len(canonical(document).encode()) > 2_000_000:
                raise ValueError("document too large")
            key = payload.get("draft_id", str(uuid4()))
            old = state.tables["registry_draft"].get(key)
            if operation == "draft_update" and (
                old is None or payload["draft_version"] != old["draft_version"]
            ):
                raise ValueError("draft_version_conflict")
            result = {
                "draft_id": key,
                "draft_version": old["draft_version"] + 1 if old else 1,
                "config": document,
                "updated_at": now.isoformat(),
            }
            state.tables["registry_draft"][key] = result
            await self._commit(state)
            return result
        if operation == "validate":
            candidate = validate(payload, self.types)
            return {"valid": True, "diff": diff(config, candidate)}
        if operation in {"activate", "rollback"}:
            if payload["expected_active_revision"] != state.active_revision:
                raise ValueError("active_revision_conflict")
            if operation == "activate":
                draft = state.tables["registry_draft"][payload["draft_id"]]
                if payload["draft_version"] != draft["draft_version"]:
                    raise ValueError("draft_version_conflict")
                document = draft["config"]
            else:
                document = state.tables["registry_revision"][str(payload["revision"])]["config"]
            new_config = validate(document, self.types)
            revision = max((int(r) for r in state.tables["registry_revision"]), default=0) + 1
            state.active_revision = revision
            state.tables["registry_revision"][str(revision)] = {
                "revision": revision,
                "config": new_config.model_dump(mode="json"),
                "checksum": checksum(new_config),
                "created_at": now.isoformat(),
            }
            state.tables["registry_activation"][str(revision)] = {
                "revision": revision,
                "at": now.isoformat(),
                "operation": operation,
            }
            if config:
                old_fp, new_fp = (
                    fingerprints(config, self.types),
                    fingerprints(new_config, self.types),
                )
                for binding in new_config.bindings:
                    if old_fp.get(binding.source_id) != new_fp[binding.source_id]:
                        state.tables["source_observation_current"].pop(binding.binding_id, None)
                self.latches = {
                    k: v for k, v in self.latches.items() if old_fp.get(k) == new_fp.get(k)
                }
            self._evaluate(state, new_config, origin="revision")
            await self._commit(state, publication=True)
            self.revision_changed.set()
            return state.tables["registry_revision"][str(revision)]
        if operation == "gap":
            self._gap(state, str(payload))
            for key, node in state.tables["node_state"].items():
                if "temporal" in node:
                    node["temporal"]["since_at"] = None
                    node["temporal"]["gap_at"] = now.isoformat()
            await self._commit(state)
            return None
        if operation == "command":
            return await self._command(state, Command.model_validate(payload))
        if operation == "observation":
            obs = payload
            if config is None or obs.binding_id not in {b.binding_id for b in config.bindings}:
                return None
            stored = state.tables["source_observation_current"].get(obs.binding_id)
            previous = Observation.model_validate(stored) if stored else None
            if (
                not is_new(obs, previous)
                and previous is not None
                and obs.observation_kind != "snapshot"
            ):
                return None
            state.tables["source_observation_current"][obs.binding_id] = obs.model_dump(mode="json")
            if previous is None or (previous.value, previous.availability) != (
                obs.value,
                obs.availability,
            ):
                state.tables["source_observation_history"][str(uuid4())] = obs.model_dump(
                    mode="json"
                )
        elif operation == "tick":
            try:
                await self.store.probe()
            except Exception:
                self._unavailable()
                raise
        else:
            raise ValueError("unknown runtime operation")
        if config:
            origin = "timer"
            if operation == "observation":
                origin = (
                    "input" if payload.observation_kind in {"live_change", "report"} else "revision"
                )
            self._evaluate(state, config, origin=origin)
            await self._commit(state, publication=True)
        else:
            await self._commit(state)
        return None

    def _inputs(
        self, contract: Contract, config: RegistryConfig, state: State
    ) -> dict[str, FieldValue]:
        now = self.clock.now_utc()
        by_source = {b.source_id: b.binding_id for b in config.bindings}
        sources = {s.source_id: s for s in config.sources}
        observations = {
            k: Observation.model_validate(v)
            for k, v in state.tables["source_observation_current"].items()
        }
        result: dict[str, FieldValue] = {}
        for item in contract.inputs:
            ref, field = resolve_ref(item.ref, config)
            if field is not None:
                envelope = state.tables["contract_state_current"].get(ref)
                result[item.name] = (
                    FieldValue.model_validate(envelope["fields"][field])
                    if envelope
                    else unknown(ReasonCode.INPUT_ABSENT, ref, now)
                )
            else:
                source = sources[ref]
                liveness = observations.get(
                    by_source.get(source.freshness.liveness_source or "", "")
                )
                result[item.name] = assess(
                    observations.get(by_source[ref]), source.freshness, now, ref, liveness
                )
        return result

    def _evaluate(
        self,
        state: State,
        config: RegistryConfig,
        *,
        origin: str,
        machine_override: dict[str, MachineState] | None = None,
    ) -> None:
        now, seq = self.clock.now_utc(), state.publication_seq + 1
        self.pending_latches = copy.deepcopy(self.latches)
        fps = fingerprints(config, self.types)
        state.tables["contract_state_current"] = {}
        for contract in topological(config):
            key = contract.contract_id
            lifecycle = state.tables["contract_lifecycle"].get(key)
            if not contract.enabled:
                state.tables["contract_lifecycle"][key] = {
                    "ever_active": bool(lifecycle),
                    "enabled": False,
                }
                continue
            inputs = self._inputs(contract, config, state)
            node = state.tables["node_state"].get(key)
            case = start_case(
                ever_active=bool(lifecycle and lifecycle.get("ever_active")),
                context=node,
                fingerprint=fps[key],
                stale=bool(lifecycle and not lifecycle.get("enabled")),
            )
            if node is None or node.get("fingerprint") != fps[key] or case == "stale":
                node = {"fingerprint": fps[key]}
            machine_state: MachineState | None = None
            try:
                result, node, machine_state = self.types.get(
                    contract.type_id, contract.type_version
                ).evaluate(
                    self.clock,
                    self.pending_latches,
                    contract,
                    inputs,
                    node,
                    state,
                    origin,
                    case,
                    (machine_override or {}).get(key),
                )
            except Exception as error:
                LOGGER.error(
                    "evaluation_error",
                    extra={"contract_id": key, "error_type": type(error).__name__},
                )
                result = unknown(ReasonCode.EVALUATION_ERROR, key, now)
            declaration = self.types.get(contract.type_id, contract.type_version)
            fields = validate_fields(declaration.schema, {"value": result}, now)
            required = [fields[k] for k, v in declaration.schema.fields.items() if v.required]
            healthy = all(v.quality == "healthy" for v in required)
            available = all(
                fields[k].quality == "healthy" for k in declaration.schema.available_projection
            )
            envelope = Envelope(
                contract_id=key,
                type={"id": contract.type_id, "version": contract.type_version},
                contract_health="healthy" if healthy else "degraded",
                fields=fields,
                available=available,
                state_machine=machine_state.model_dump(mode="json") if machine_state else None,
                computed_at=now,
                published_at=now,
                publication_seq=seq,
                registry_revision=state.active_revision,
                epoch_id=state.epoch_id,
            )
            state.tables["node_state"][key] = node
            state.tables["contract_lifecycle"][key] = {
                "ever_active": True,
                "enabled": True,
                "start_case": case,
            }
            state.tables["contract_state_current"][key] = envelope.model_dump(mode="json")
            state.tables["contract_state_history"][f"{seq}:{key}"] = envelope.model_dump(
                mode="json"
            )
            if machine_state:
                previous_sm = state.tables["sm_instance"].get(key)
                data = machine_state.model_dump(mode="json")
                state.tables["sm_instance"][key] = data
                state.tables["sm_episode"][machine_state.episode_id] = data
                if previous_sm != data:
                    state.tables["sm_transition"][str(uuid4())] = {"contract_id": key, **data}
                if machine_state.deadline:
                    state.tables["deadline"][machine_state.deadline.deadline_id] = (
                        machine_state.deadline.model_dump(mode="json")
                    )
        state.publication_seq = seq
        state.publications[seq] = {
            "created_at": now.isoformat(),
            "epoch_id": state.epoch_id,
            "registry_revision": state.active_revision,
        }

    async def _command(self, state: State, command: Command) -> dict[str, Any]:
        digest, now = checksum(command), self.clock.now_utc()
        old = state.tables["command_log"].get(command.command_id)
        if old:
            return old["result"] if old["digest"] == digest else {"status": "command_id_conflict"}
        config = self._config(state)
        contract = (
            next((c for c in config.contracts if c.contract_id == command.contract_id), None)
            if config
            else None
        )
        result: dict[str, Any] = {"command_id": command.command_id, "status": "not_supported"}
        override: dict[str, MachineState] = {}
        if command.valid_until <= now:
            result["status"] = "expired"
        elif command.issued_at > now or command.valid_until <= command.issued_at:
            result.update(status="rejected", reason="invalid_value")
        elif (
            command.expected_registry_revision is not None
            and command.expected_registry_revision != state.active_revision
        ):
            result.update(status="rejected", reason="config_incomplete")
        elif (
            contract
            and contract.enabled
            and config
            and self.types.get(contract.type_id, contract.type_version).machine_factory
        ):
            factory = self.types.get(contract.type_id, contract.type_version).machine_factory
            assert factory is not None
            machine = factory(contract.parameters)
            data = state.tables["node_state"].get(contract.contract_id, {}).get("machine")
            if command.args or not data:
                result.update(status="rejected", reason="guard_rejected")
            else:
                updated, status = machine.step(
                    MachineState.model_validate(data),
                    command.command,
                    self._inputs(contract, config, state),
                    now,
                    state.active_revision,
                    manual=True,
                )
                result["status"] = "rejected" if status == "guard_rejected" else status
                if status == "guard_rejected":
                    result["reason"] = status
                if status == "accepted":
                    override[contract.contract_id] = updated
        state.tables["command_log"][command.command_id] = {
            "digest": digest,
            "result": result,
            "at": now.isoformat(),
        }
        if override and config:
            self._evaluate(state, config, origin="command", machine_override=override)
        await self._commit(state, publication=bool(override))
        return result

    def _unavailable(self) -> None:
        self.persistence = False
        self.confirmed = False
        self._broadcast(self.service_state())

    async def _commit(
        self, state: State, *, publication: bool = False, resync: bool = False
    ) -> None:
        started = self.clock.monotonic()
        try:
            await self.store.commit(state)
        except Exception:
            self.pending_latches = None
            self._unavailable()
            raise
        previous_seq = self.state.publication_seq
        self.state = state
        if self.pending_latches is not None:
            self.latches = self.pending_latches
            self.pending_latches = None
        self.persistence = True
        self.confirmed = True
        self.commit_duration = self.clock.monotonic() - started
        if resync:
            self._broadcast({"type": "resync_required", "reason": "epoch"})
        elif publication:
            self._broadcast(
                {
                    "type": "delta",
                    "publication_seq": state.publication_seq,
                    "prev_seq": previous_seq,
                    "epoch_id": state.epoch_id,
                    "contracts": state.tables["contract_state_current"],
                }
            )

    def snapshot(self, contracts: list[str] | None = None) -> dict[str, Any]:
        items = self.state.tables["contract_state_current"]
        return {
            "type": "snapshot",
            "publication_seq": self.state.publication_seq,
            "epoch_id": self.state.epoch_id,
            "registry_revision": self.state.active_revision,
            "publication_confirmed": self.confirmed,
            "contracts": {k: v for k, v in items.items() if contracts is None or k in contracts},
        }

    def subscribe(self, max_queue: int = 32) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(max_queue)
        self.subscribers.add(queue)
        return queue

    def _broadcast(self, event: dict[str, Any]) -> None:
        for queue in self.subscribers:
            if queue.full():
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait({"type": "resync_required", "reason": "slow_subscriber"})
            else:
                queue.put_nowait(event)

    async def stop(self) -> None:
        if self.stopping:
            return
        self.stopping = True
        await self.queue.join()
        self._broadcast({"type": "going_away"})
        if self.persistence:
            state = self.state.clone()
            state.tables["runtime_epoch"][state.epoch_id]["ended_at"] = (
                self.clock.now_utc().isoformat()
            )
            await self._commit(state)
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
