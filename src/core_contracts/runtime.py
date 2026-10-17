"""One serial authority: stage, evaluate, commit, then make results visible."""

import asyncio
import copy
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from pydantic import Field, ValidationError, field_validator

from .calendar_inputs import project
from .clock import Alarm, Clock
from .declarative import GuardEvaluationError
from .evidence import Observation, assess, is_new, is_older
from .lifecycle import EDITORIAL, transition_allowed
from .model import Model, canonical, checksum, utc
from .persistence import State, Store
from .producer import Context, Producer
from .quality import FieldValue, ReasonCode, unknown
from .registry import (
    Contract,
    RegistryConfig,
    affected_sources,
    diff,
    fingerprints,
    registry_types,
    required_sources,
    resolve_ref,
    storage_document,
    topological,
    validate,
)
from .resolver import Bucket
from .schema import Envelope, TypeRegistry, validate_fields
from .statemachine import MachineState
from .temporal import start_case

LOGGER = logging.getLogger(__name__)


class CommandOrigin(Model):
    kind: str = Field(min_length=1)
    actor: str = Field(min_length=1)
    client_name: str = Field(min_length=1)


class Command(Model):
    command_id: str = Field(min_length=1)
    contract_id: str
    command: str
    args: dict[str, Any]
    origin: CommandOrigin
    issued_at: datetime
    valid_until: datetime
    expected_registry_revision: int | None = None

    _times = field_validator("issued_at", "valid_until")(utc)


@dataclass
class Work:
    operation: str
    payload: Any
    future: asyncio.Future[Any] | None = None


@dataclass
class SnapshotBatch:
    observations: list[Observation]
    registry_revision: int


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
        self.configuration_error = False
        self.first_snapshot = False
        self.bridge = "not_needed"
        self.bridge_version: str | None = None
        self.bridge_subscriptions = 0
        self.dependency_connections: dict[str, bool] = {}
        self.ha = "not_needed"
        self.ha_changed_at = self.clock.now_utc()
        self.mqtt = "disabled"
        self.latest: dict[str, Observation] = {}
        self.overflow = False
        self.snapshot_pending = False
        self.snapshot_revision: int | None = None
        self.overflow_bindings: set[str] = set()
        self.overflow_serial = 0
        self.next_evaluation: datetime | None = None
        self.evaluation_alarm: Alarm | None = None
        self.last_clock = clock.now_utc()
        self.resubscribe = asyncio.Event()
        self.revision_changed = asyncio.Event()
        self.mqtt_revision_changed = asyncio.Event()
        self.subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self.latches: dict[str, Bucket] = {}
        self.pending_latches: dict[str, Bucket] | None = None
        self.stopping = False
        self.commit_duration = 0.0
        self.last_heartbeat = clock.monotonic()
        self.refresh_requests: asyncio.Queue[tuple[int, str]] = asyncio.Queue(256)
        self.pending_refresh: set[str] = set()
        self.refresh_overflow = 0
        self.entity_discovery: Callable[..., Awaitable[list[dict[str, Any]]]] | None = None

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
            "ha": self.ha if self.requires_ha_snapshot else "not_needed",
            "bridge": self.bridge if self.requires_ha_snapshot else "not_needed",
            "mqtt": self.mqtt,
            "reasons": self.readiness_reasons,
            "ha_disconnected_since": self.ha_changed_at.isoformat()
            if self.bridge == "unavailable"
            else None,
            "ha_unbounded_values": self._unbounded_ha_values(),
        }

    def _unbounded_ha_values(self) -> int:
        config = self.config
        if config is None or self.bridge != "unavailable":
            return 0
        bindings = {b.source_id: b for b in config.bindings if b.adapter.kind.startswith("ha_")}
        return sum(
            1
            for source in config.sources
            if source.source_id in bindings
            and source.freshness.mode == "event_stateful"
            and assess(
                Observation.model_validate(raw)
                if (
                    raw := self.state.tables["source_observation_current"].get(
                        bindings[source.source_id].binding_id
                    )
                )
                else None,
                source.freshness,
                self.clock.now_utc(),
                source.source_id,
            ).status
            == "valid"
        )

    @property
    def readiness_reasons(self) -> list[str]:
        reasons = []
        if self.configuration_error:
            reasons.append("invalid_supervisor_options")
        if not self.persistence:
            reasons.append("persistence_unavailable")
        if self.state.active_revision == 0:
            reasons.append("no_active_registry")
        if self.requires_ha_snapshot and not self.first_snapshot:
            reasons.append("first_bridge_snapshot_pending")
        return reasons

    def _audit(self, state: State, operation: str, payload: dict[str, Any], **details: Any) -> None:
        state.tables["diagnostic_event"][str(uuid4())] = {
            "kind": "administrative",
            "operation": operation,
            "at": self.clock.now_utc().isoformat(),
            "epoch_id": state.epoch_id,
            "registry_revision": state.active_revision,
            "actor": payload.get("_actor", {"kind": "internal", "role": "system"}),
            **details,
        }

    async def _definition_versions(self, config: RegistryConfig) -> None:
        from .validation import RegistryValidationError, ValidationIssue

        issues = []
        for kind, objects, identity_key, version_key, getter in (
            ("definitions", config.definitions, "type_id", "type_version", self.store.definition),
            ("catalogs", config.catalogs, "catalog_id", "version", self.store.catalog),
        ):
            for index, item in enumerate(objects):
                document = item.model_dump(mode="json")
                identity = document[identity_key]
                previous = await getter(identity, document[version_key])
                if previous and checksum(
                    {k: v for k, v in previous.items() if k not in EDITORIAL}
                ) != checksum({k: v for k, v in document.items() if k not in EDITORIAL}):
                    issues.append(
                        ValidationIssue(
                            code="immutable_definition_version",
                            path=f"/{kind}/{index}/{version_key}",
                            object_id=identity,
                            message="immutable version",
                        )
                    )
                if previous and not transition_allowed(
                    previous.get("lifecycle", "active"),
                    document.get("lifecycle", "active"),
                    document.get("reactivation_note"),
                    previous.get("reactivation_note"),
                ):
                    issues.append(
                        ValidationIssue(
                            code="lifecycle_transition",
                            path=f"/{kind}/{index}/lifecycle",
                            object_id=identity,
                            message="explicit lifecycle transition or new reactivation note required",
                        )
                    )
        old = {c.contract_id: c for c in self.config.contracts} if self.config else {}
        retired = {
            (d.type_id, d.type_version) for d in config.definitions if d.lifecycle == "retired"
        }
        for index, contract in enumerate(config.contracts):
            prior = old.get(contract.contract_id)
            if (
                contract.enabled
                and (contract.type_id, contract.type_version) in retired
                and (
                    prior is None
                    or not prior.enabled
                    or (prior.type_id, prior.type_version)
                    != (contract.type_id, contract.type_version)
                )
            ):
                issues.append(
                    ValidationIssue(
                        code="version_retired",
                        path=f"/contracts/{index}/type_version",
                        object_id=contract.contract_id,
                        message="retired version cannot be newly bound",
                    )
                )
        old_bindings = {b.binding_id: b for b in self.config.bindings} if self.config else {}
        retired_catalogs = {c.catalog_id for c in config.catalogs if c.lifecycle == "retired"}
        for index, binding in enumerate(config.bindings):
            if (
                binding.transform
                and binding.transform.catalog_id in retired_catalogs
                and (
                    binding.binding_id not in old_bindings
                    or old_bindings[binding.binding_id].source_id != binding.source_id
                    or old_bindings[binding.binding_id].transform != binding.transform
                )
            ):
                issues.append(
                    ValidationIssue(
                        code="version_retired",
                        path=f"/bindings/{index}/transform",
                        object_id=binding.binding_id,
                        message="retired catalog cannot be newly bound",
                    )
                )
        if issues:
            raise RegistryValidationError(issues)

    async def _source_types(self, config: RegistryConfig) -> None:
        from .registry import Source
        from .validation import RegistryValidationError, ValidationIssue

        issues = []
        for index, source in enumerate(config.sources):
            for document in await self.store.source_history(
                source.source_id, include_revision=True
            ):
                previous_revision = document.pop("_registry_revision")
                old = Source.model_validate(document)
                schema, previous = source.value_schema, old.value_schema
                inferred = {"boolean": "bool", "numeric": "number", "text": "text"}
                checks = (
                    ("source_type", source.source_type != old.source_type),
                    (
                        "value_schema/type",
                        (schema.type if schema else inferred.get(source.source_type))
                        != (previous.type if previous else inferred.get(old.source_type)),
                    ),
                    (
                        "value_schema/unit",
                        (schema.unit if schema else None) != (previous.unit if previous else None),
                    ),
                    (
                        "value_schema/value_catalog",
                        bool(
                            previous
                            and not set(previous.value_catalog).issubset(
                                schema.value_catalog if schema else ()
                            )
                        ),
                    ),
                )
                for field, changed in checks:
                    if changed:
                        old_value = (
                            old.source_type
                            if field == "source_type"
                            else {
                                "value_schema/type": previous.type
                                if previous
                                else inferred.get(old.source_type),
                                "value_schema/unit": previous.unit if previous else None,
                                "value_schema/value_catalog": list(previous.value_catalog)
                                if previous
                                else [],
                            }[field]
                        )
                        new_value = (
                            source.source_type
                            if field == "source_type"
                            else {
                                "value_schema/type": schema.type
                                if schema
                                else inferred.get(source.source_type),
                                "value_schema/unit": schema.unit if schema else None,
                                "value_schema/value_catalog": list(schema.value_catalog)
                                if schema
                                else [],
                            }[field]
                        )
                        old_text = str(old_value) if old_value is not None else None
                        new_text = str(new_value) if new_value is not None else None
                        issues.append(
                            ValidationIssue(
                                code="immutable_source_catalog"
                                if field.endswith("value_catalog")
                                else "immutable_source_type",
                                path=f"/sources/{index}/{field}",
                                object_id=source.source_id,
                                message=f"{field}: {old_text!r} aus Version {previous_revision} → {new_text!r}. Übernommene Quellen behalten Typ und Einheit; ihre Werteliste darf nur ergänzt werden.",
                                parameters={
                                    "field": field,
                                    "oldValue": old_text,
                                    "newValue": new_text,
                                    "revision": previous_revision,
                                },
                            )
                        )
        if issues:
            raise RegistryValidationError(list({(i.code, i.path): i for i in issues}.values()))

    @property
    def live(self) -> bool:
        return (
            self.task is not None
            and not self.task.done()
            and self.clock.monotonic() - self.last_heartbeat < 5
        )

    @property
    def ready(self) -> bool:
        return (
            not self.configuration_error
            and self.persistence
            and self.state.active_revision > 0
            and (not self.requires_ha_snapshot or self.first_snapshot)
        )

    @property
    def requires_ha_snapshot(self) -> bool:
        config = self.config
        if config is None:
            return False
        needed = required_sources(config)
        return any(
            b.source_id in needed
            and (b.adapter.kind.startswith("ha_") or b.adapter.kind == "connectivity")
            for b in config.bindings
        )

    async def start(self) -> None:
        self.state = await self.store.load()
        self.persistence = True
        await self._restore("process_restart")
        if self.task is None:
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
        for observation_data in state.tables["source_observation_current"].values():
            await self._record_observation(state, Observation.model_validate(observation_data))
        if reason == "process_restart":
            for observation in state.tables["source_observation_current"].values():
                observation["observation_kind"] = "restore"
        for node in state.tables["node_state"].values():
            for context in self._temporal_contexts(node):
                if "temporal" in context:
                    context["restore_pending"] = copy.deepcopy(context["temporal"])
        config = self._config(state)
        if config:
            self._evaluate(state, config, origin="restore", initial_latches={})
        else:
            self.pending_latches = {}
        await self._commit(state, publication=bool(config), resync=True)
        self._broadcast(self.service_state())

    async def submit(self, operation: str, payload: Any = None) -> Any:
        if self.stopping:
            raise RuntimeError("going_away")
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        await self.queue.put(Work(operation, payload, future))
        return await asyncio.shield(future)

    def ingest(self, observation: Observation) -> None:
        if self.stopping:
            return
        if observation.registry_revision not in {None, self.state.active_revision}:
            return
        if not self.persistence:
            self.latest[observation.binding_id] = observation
            return
        try:
            self.queue.put_nowait(Work("observation", observation))
        except asyncio.QueueFull:
            self.latest[observation.binding_id] = observation
            self.overflow = True
            self.overflow_serial += 1
            self.resubscribe.set()

    def tick(self) -> None:
        self.last_heartbeat = self.clock.monotonic()
        if not self.queue.full() and not self.stopping:
            self.queue.put_nowait(Work("tick", None))

    def ingest_snapshot(self, observations: list[Observation], revision: int | None = None) -> None:
        if self.stopping:
            return
        if revision is not None and revision != self.state.active_revision:
            return
        try:
            self.queue.put_nowait(
                Work(
                    "snapshot",
                    SnapshotBatch(
                        observations, self.state.active_revision if revision is None else revision
                    ),
                )
            )
        except asyncio.QueueFull:
            self.latest.update({o.binding_id: o for o in observations})
            self.overflow = True
            self.overflow_serial += 1
            self.snapshot_pending = True
            self.snapshot_revision = self.state.active_revision if revision is None else revision

    async def run(self) -> None:
        while True:
            work = await self.queue.get()
            try:
                result = await self.process(work.operation, work.payload)
                if work.future and not work.future.done():
                    work.future.set_result(result)
            except Exception as error:
                from .validation import RegistryValidationError

                expected_error = isinstance(error, RegistryValidationError) or (
                    type(error) is ValueError
                    and str(error)
                    in {
                        "draft_limit",
                        "draft_identity_conflict",
                        "draft_version_conflict",
                        "active_revision_conflict",
                        "sensitive key",
                        "credential URL",
                        "document too large",
                        "document too deep",
                        "configuration object required",
                        "invalid_draft_id",
                        "invalid_draft_version",
                        "invalid_draft_display_name",
                        "invalid_expected_revision",
                        "revision_not_found",
                    }
                )
                LOGGER.log(
                    logging.INFO if expected_error else logging.ERROR,
                    "processor_request_failed",
                    extra={"operation": work.operation, "error_type": type(error).__name__},
                )
                if work.future and not work.future.done():
                    work.future.set_exception(error)
            finally:
                self.queue.task_done()

    async def process(self, operation: str, payload: Any) -> Any:
        if operation == "snapshot" and isinstance(payload, SnapshotBatch):
            if payload.registry_revision != self.state.active_revision:
                return None
            payload = payload.observations
        if operation == "observation" and payload.registry_revision not in {
            None,
            self.state.active_revision,
        }:
            return None
        if operation == "recover":
            last_sequence = self.state.publication_seq
            self.state = await self.store.load()
            rollback = self.state.publication_seq < last_sequence
            self.state.publication_seq = max(last_sequence, self.state.publication_seq)
            self.persistence = True
            self.first_snapshot = False
            for observation in self.state.tables["source_observation_current"].values():
                observation["observation_kind"] = "restore"
            # Coalesced outage input is snapshot evidence, never replayed as events.
            buffered = dict(self.latest)
            for obs in buffered.values():
                if obs.registry_revision not in {None, self.state.active_revision}:
                    continue
                if self._older_than_stored(self.state, obs):
                    continue
                self.state.tables["source_observation_current"][obs.binding_id] = obs.model_copy(
                    update={"observation_kind": "snapshot"}
                ).storage_document()
            await self._restore("database_rollback" if rollback else "db_outage")
            for key, value in buffered.items():
                if self.latest.get(key) is value:
                    self.latest.pop(key)
            self.overflow = bool(self.latest)
            self.resubscribe.set()
            self.mqtt_revision_changed.set()
            return None
        if operation == "bridge_state":
            previous_bridge = self.bridge
            previous_state = (self.bridge, self.ha)
            self.bridge, self.ha = payload
            if previous_state != payload:
                self.ha_changed_at = self.clock.now_utc()
            self.dependency_connections["ha"] = self.bridge == "connected"
            self._broadcast(self.service_state())
            if previous_state != payload and self.persistence and self.config:
                staged = self.state.clone()
                bindings = {
                    b.binding_id for b in self.config.bindings if b.adapter.kind.startswith("ha_")
                }
                if self.bridge == "unavailable" and previous_bridge != "unavailable":
                    self._gap(staged, "ha_disconnect")
                    self._invalidate(staged, self.config, bindings)
                self._evaluate(staged, self.config, origin="revision")
                try:
                    await self._commit(staged, publication=True)
                    self._broadcast(self.service_state())
                except Exception as error:
                    LOGGER.warning(
                        "transport_status_uncommitted", extra={"error_type": type(error).__name__}
                    )
            return None
        if operation == "mqtt_state":
            previous_mqtt = self.mqtt
            self.mqtt = str(payload)
            self.dependency_connections["mqtt"] = self.mqtt == "connected"
            self._broadcast(self.service_state())
            if (
                self.mqtt == "disconnected"
                and previous_mqtt == "connected"
                and self.persistence
                and self.config
            ):
                staged = self.state.clone()
                bindings = {b.binding_id for b in self.config.bindings if b.adapter.kind == "mqtt"}
                self._gap(staged, "mqtt_disconnect")
                self._invalidate(staged, self.config, bindings)
                for binding_id in bindings:
                    if binding_id in staged.tables["source_observation_current"]:
                        staged.tables["source_observation_current"][binding_id]["availability"] = (
                            "unavailable"
                        )
                self._evaluate(staged, self.config, origin="revision")
                try:
                    await self._commit(staged, publication=True)
                except Exception as error:
                    LOGGER.warning(
                        "transport_status_uncommitted", extra={"error_type": type(error).__name__}
                    )
            return None
        if operation == "snapshot_complete":
            self.first_snapshot = True
            self._broadcast(self.service_state())
            return None
        if not self.persistence:
            if operation in {"tick", "gap"}:
                return None
            if operation == "observation":
                self.latest[payload.binding_id] = payload
                return None
            if operation == "snapshot":
                self.latest.update({o.binding_id: o for o in payload})
                self.snapshot_pending = True
                self.snapshot_revision = self.state.active_revision
                return None
            raise RuntimeError("persistence_unavailable")
        # Overflow recovery is its own transaction. A following validation, OCC
        # conflict, duplicate event or failed command cannot discard the buffer.
        if self.overflow:
            await self._drain_overflow()
        if operation == "tick":
            try:
                await self.store.probe()
            except Exception:
                self._unavailable()
                raise
            now = self.clock.now_utc()
            clock_went_back = now < self.last_clock
            self.last_clock = now
            if not clock_went_back and (self.next_evaluation is None or now < self.next_evaluation):
                return None
        state = self.state.clone()
        now = self.clock.now_utc()
        config = self._config(state)
        if operation in {"draft_create", "draft_update"}:
            document = payload["config"]
            # Drafts can be incomplete, but cannot carry credentials or invalid JSON.
            from .registry import safe_document

            if not isinstance(document, dict):
                raise ValueError("configuration object required")
            safe_document(document)
            if len(canonical(document).encode()) > 2_000_000:
                raise ValueError("document too large")
            key = payload.get("draft_id", str(uuid4()))
            if not isinstance(key, str) or not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", key
            ):
                raise ValueError("invalid_draft_id")
            if operation == "draft_update" and (
                type(payload.get("draft_version")) is not int or payload["draft_version"] < 1
            ):
                raise ValueError("invalid_draft_version")
            old = state.tables["registry_draft"].get(key)
            if operation == "draft_create" and old is not None:
                raise ValueError("draft_identity_conflict")
            if operation == "draft_create" and len(state.tables["registry_draft"]) >= 100:
                raise ValueError("draft_limit")
            if operation == "draft_update" and (
                old is None or payload["draft_version"] != old["draft_version"]
            ):
                raise ValueError("draft_version_conflict")
            result = {
                "draft_id": key,
                "draft_version": old["draft_version"] + 1 if old else 1,
                "config": document,
                "updated_at": now.isoformat(),
                "created_at": old.get("created_at", old["updated_at"]) if old else now.isoformat(),
                "base_revision": old.get("base_revision", state.active_revision)
                if old
                else state.active_revision,
                "display_name": payload.get(
                    "display_name", old.get("display_name", "") if old else ""
                ),
            }
            if not isinstance(result["display_name"], str) or len(result["display_name"]) > 256:
                raise ValueError("invalid_draft_display_name")
            state.tables["registry_draft"][key] = result
            self._audit(
                state, operation, payload, draft_id=key, draft_version=result["draft_version"]
            )
            await self._commit(state)
            return result
        if operation == "draft_delete":
            key = payload["draft_id"]
            if type(payload.get("draft_version")) is not int:
                raise ValueError("invalid_draft_version")
            old = state.tables["registry_draft"].get(key)
            if old is None or payload["draft_version"] != old["draft_version"]:
                raise ValueError("draft_version_conflict")
            del state.tables["registry_draft"][key]
            self._audit(state, operation, payload, draft_id=key, draft_version=old["draft_version"])
            await self._commit(state)
            return {"deleted": True, "draft_id": key}
        if operation == "audit":
            self._audit(state, payload["operation"], payload, **payload.get("details", {}))
            await self._commit(state)
            return None
        if operation == "validate":
            candidate = validate(payload, self.types)
            await self._definition_versions(candidate)
            await self._source_types(candidate)
            from .capabilities import machine_description

            types = registry_types(candidate, self.types)
            machines = {}
            for contract in candidate.contracts:
                declaration = types.get(contract.type_id, contract.type_version)
                if declaration.machine_factory:
                    machines[contract.contract_id] = machine_description(
                        declaration.machine_factory(contract.parameters)
                    )
            return {
                "valid": True,
                "issues": [],
                "warnings": [
                    {
                        "code": "machine_never_recovers",
                        "path": f"/definitions/{index}/machine/reinitialize_when",
                        "object_id": definition.type_id,
                        "message": "Dieser Ablauf kann sich nach einer Änderung nie selbst erholen.",
                    }
                    for index, definition in enumerate(candidate.definitions)
                    if definition.machine
                    and definition.machine.reinitialize_when.op == "literal"
                    and getattr(definition.machine.reinitialize_when, "value", None) is False
                ],
                "diff": diff(config, candidate, self.types),
                "machine_definitions": machines,
            }
        if operation in {"activate", "rollback"}:
            note = payload.get("note", "")
            if not isinstance(note, str) or len(note) > 256:
                raise ValueError("invalid_revision_note")
            note = note.strip()
            if type(payload.get("expected_active_revision")) is not int:
                raise ValueError("invalid_expected_revision")
            if payload["expected_active_revision"] != state.active_revision:
                raise ValueError("active_revision_conflict")
            if operation == "activate":
                draft = state.tables["registry_draft"][payload["draft_id"]]
                if payload["draft_version"] != draft["draft_version"]:
                    raise ValueError("draft_version_conflict")
                document = draft["config"]
            else:
                historical = await self.store.get("registry_revision", str(payload["revision"]))
                if historical is None:
                    raise ValueError("revision_not_found")
                document = historical["config"]
            new_config = validate(document, self.types)
            await self._definition_versions(new_config)
            await self._source_types(new_config)
            revision = max((int(r) for r in state.tables["registry_revision"]), default=0) + 1
            state.active_revision = revision
            state.tables["registry_revision"][str(revision)] = {
                "revision": revision,
                "config": storage_document(new_config),
                "checksum": checksum(storage_document(new_config)),
                "created_at": now.isoformat(),
                "actor": payload.get("_actor", {"kind": "internal", "role": "system"}),
                **({"note": note} if note else {}),
            }
            state.tables["registry_activation"][str(revision)] = {
                "revision": revision,
                "at": now.isoformat(),
                "operation": operation,
            }
            self._audit(
                state, operation, payload, revision=revision, **({"note": note} if note else {})
            )
            next_latches = self.latches
            if config:
                old_fp, new_fp = (
                    fingerprints(config, self.types),
                    fingerprints(new_config, self.types),
                )
                for binding in new_config.bindings:
                    if old_fp.get(binding.source_id) != new_fp[binding.source_id]:
                        state.tables["source_observation_current"].pop(binding.binding_id, None)
                next_latches = {
                    k: v
                    for k, v in self.latches.items()
                    if old_fp.get(k.partition(":")[0]) == new_fp.get(k.partition(":")[0])
                }
            self._evaluate(state, new_config, origin="revision", initial_latches=next_latches)
            await self._commit(state, publication=True)
            old_ha = (
                {b.model_dump_json() for b in config.bindings if b.adapter.kind.startswith("ha_")}
                if config
                else set()
            )
            new_ha = {
                b.model_dump_json() for b in new_config.bindings if b.adapter.kind.startswith("ha_")
            }
            if new_ha - old_ha:
                self.first_snapshot = False
            self._broadcast(self.service_state())
            LOGGER.info(
                "registry_rollback" if operation == "rollback" else "registry_activated",
                extra={"revision": revision},
            )
            self.revision_changed.set()
            self.mqtt_revision_changed.set()
            return state.tables["registry_revision"][str(revision)]
        if operation == "gap":
            self._gap(state, str(payload))
            if config:
                bindings = {
                    b.binding_id
                    for b in config.bindings
                    if not str(payload).startswith("mqtt") or b.adapter.kind == "mqtt"
                }
                self._invalidate(state, config, bindings)
            try:
                await self._commit(state)
            except Exception as error:
                LOGGER.warning("gap_uncommitted", extra={"error_type": type(error).__name__})
            return None
        if operation == "command":
            return await self._command(state, Command.model_validate(payload))
        if operation == "manual_restart_preview":
            from .manual_restart import preview

            return preview(self, state, payload)
        if operation == "manual_restart":
            from .manual_restart import execute

            return await execute(self, state, payload)
        if operation == "snapshot":
            for obs in payload:
                if (
                    config
                    and obs.binding_id in {b.binding_id for b in config.bindings}
                    and not self._older_than_stored(state, obs)
                ):
                    state.tables["source_observation_current"][obs.binding_id] = (
                        obs.storage_document()
                    )
                    await self._record_observation(state, obs)
        elif operation == "observation":
            obs = payload
            if config is None or obs.binding_id not in {b.binding_id for b in config.bindings}:
                return None
            stored = state.tables["source_observation_current"].get(obs.binding_id)
            previous = Observation.model_validate(stored) if stored else None
            # Overflow drains the newest coalesced observation before older queue
            # entries. Quality changes must obey measurement order too. Without
            # comparable source times, keep the conservative negative-evidence
            # path below; receipt time must never manufacture a measurement.
            if is_older(obs, previous):
                return None
            if (
                not is_new(obs, previous)
                and previous is not None
                and obs.observation_kind != "snapshot"
                and not (
                    (
                        obs.availability != "available"
                        or obs.ha_restored
                        or obs.mqtt_retained
                        or obs.assumed_state
                        or obs.invalid_timestamp
                        or obs.transform_error
                    )
                    and (
                        obs.availability,
                        obs.ha_restored,
                        obs.mqtt_retained,
                        obs.assumed_state,
                        obs.invalid_timestamp,
                        obs.transform_error,
                    )
                    != (
                        previous.availability,
                        previous.ha_restored,
                        previous.mqtt_retained,
                        previous.assumed_state,
                        previous.invalid_timestamp,
                        previous.transform_error,
                    )
                )
            ):
                return None
            state.tables["source_observation_current"][obs.binding_id] = obs.storage_document()
            await self._record_observation(state, obs)
        elif operation != "tick":
            raise ValueError("unknown runtime operation")
        if config:
            origin = "timer"
            if operation == "observation":
                origin = (
                    "input" if payload.observation_kind in {"live_change", "report"} else "revision"
                )
            self._evaluate(
                state,
                config,
                origin=origin,
                trigger_source=payload.source_id if operation == "observation" else None,
            )
            # Timer evaluation is bounded by current state; persist only actual
            # context/evidence/quality changes, including due temporal operations.
            if (
                state.tables != self.state.tables
                or state.publication_seq != self.state.publication_seq
            ):
                await self._commit(state, publication=True)
            else:
                self.pending_latches = None
                self._plan_evaluation()
        elif operation != "tick":
            await self._commit(state)
        if operation == "snapshot":
            self.first_snapshot = True
            self._broadcast(self.service_state())
        return None

    @staticmethod
    def _older_than_stored(state: State, observation: Observation) -> bool:
        stored = state.tables["source_observation_current"].get(observation.binding_id)
        return is_older(observation, Observation.model_validate(stored) if stored else None)

    async def _record_observation(self, state: State, observation: Observation) -> None:
        if observation.reference not in state.tables["source_observation_history"] and (
            await self.store.get("source_observation_history", observation.reference) is None
        ):
            state.tables["source_observation_history"][observation.reference] = (
                observation.storage_document()
            )

    def _invalidate(self, state: State, config: RegistryConfig, bindings: set[str]) -> None:
        affected = {b.source_id for b in config.bindings if b.binding_id in bindings}
        affected = affected_sources(config, affected)
        for contract in topological(config):
            if not any(resolve_ref(i.ref, config)[0] in affected for i in contract.inputs):
                continue
            affected.add(contract.contract_id)
            node = state.tables["node_state"].get(contract.contract_id, {})
            for context in self._temporal_contexts(node):
                if "temporal" in context:
                    context["restore_pending"] = copy.deepcopy(context["temporal"])
                    context["restore_pending"]["grace_armed"] = False
                    context["temporal"].update(
                        since_at=None,
                        grace_armed=False,
                        gap_at=self.clock.now_utc().isoformat(),
                    )

    @staticmethod
    def _temporal_contexts(node: dict[str, Any]) -> list[dict[str, Any]]:
        rules = node.get("rules", {})
        return [
            node,
            *(
                context
                for context in (rules.values() if isinstance(rules, dict) else ())
                if isinstance(context, dict)
            ),
        ]

    async def _drain_overflow(self) -> None:
        serial = self.overflow_serial
        buffered = dict(self.latest)
        state = self.state.clone()
        config = self._config(state)
        self._gap(state, "ingest_overflow")
        if config:
            self._invalidate(state, config, set(buffered) | self.overflow_bindings)
            for binding_id in self.overflow_bindings:
                if binding_id in state.tables["source_observation_current"]:
                    state.tables["source_observation_current"][binding_id]["availability"] = (
                        "unavailable"
                    )
        for obs in buffered.values():
            if obs.registry_revision not in {None, state.active_revision}:
                continue
            if self._older_than_stored(state, obs):
                continue
            state.tables["source_observation_current"][obs.binding_id] = obs.model_copy(
                update={"observation_kind": "snapshot"}
            ).storage_document()
            await self._record_observation(
                state, obs.model_copy(update={"observation_kind": "snapshot"})
            )
        if config:
            self._evaluate(state, config, origin="revision")
        await self._commit(state, publication=True)
        for key, value in buffered.items():
            if self.latest.get(key) is value:
                self.latest.pop(key)
        newer_overflow = self.overflow_serial != serial
        self.overflow = bool(self.latest) or newer_overflow
        if not newer_overflow:
            self.overflow_bindings.clear()
        if self.snapshot_pending and not self.overflow:
            if self.snapshot_revision in {None, state.active_revision}:
                self.first_snapshot = True
            self.snapshot_pending = False
            self._broadcast(self.service_state())

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
        dependencies = {d.dependency_id: d for d in config.dependencies}

        def source_value(ref: str, visited: set[str]) -> FieldValue:
            if ref in visited:
                return unknown(ReasonCode.DEPENDENCY_UNAVAILABLE, ref, now)
            source = sources[ref]
            dependency = dependencies[source.dependency_id]
            available = self.dependency_connections.get(dependency.kind, True)
            if dependency.kind == "ha" and dependency.monitor == "internal":
                available = True  # Transport loss is not sensor evidence.
            if dependency.monitor == "source":
                monitor = source_value(dependency.source_id or "", visited | {ref})
                available = (
                    monitor.usable(now) and monitor.quality == "healthy" and monitor.value is True
                )
            if not available:
                return unknown(ReasonCode.DEPENDENCY_UNAVAILABLE, source.dependency_id, now)
            liveness = observations.get(by_source.get(source.freshness.liveness_source or "", ""))
            return assess(
                observations.get(by_source.get(ref, "")), source.freshness, now, ref, liveness
            )

        result: dict[str, FieldValue] = {}
        for item in contract.inputs:
            ref, field = resolve_ref(item.ref, config)
            if field is not None:
                envelope = state.tables["contract_state_current"].get(ref)
                result[item.name] = (
                    FieldValue.model_validate(envelope["fields"][field])
                    if envelope
                    else unknown(ReasonCode.DEPENDENCY_UNAVAILABLE, ref, now)
                )
            else:
                result[item.name] = source_value(ref, set())
        return result

    def _evaluate(
        self,
        state: State,
        config: RegistryConfig,
        *,
        origin: str,
        machine_override: dict[str, MachineState] | None = None,
        trigger_source: str | None = None,
        initial_latches: dict[str, Bucket] | None = None,
    ) -> set[str]:
        """Return transaction-local failures after discarding their staged producer effects."""
        evaluation_errors: set[str] = set()
        calendar_changed = self._calendar_observations(state, config, origin)
        now, seq = self.clock.now_utc(), state.publication_seq + 1
        self.pending_latches = copy.deepcopy(
            self.latches if initial_latches is None else initial_latches
        )
        fps = fingerprints(config, self.types)
        types = registry_types(config, self.types)
        self.pending_refresh = set()
        previous_config = self.config
        if previous_config:
            new_contracts = {c.contract_id: c for c in config.contracts}
            for old in previous_config.contracts:
                replacement = new_contracts.get(old.contract_id)
                old_node = state.tables["node_state"].get(old.contract_id, {})
                if old.enabled and (
                    replacement is None
                    or not replacement.enabled
                    or old_node.get("fingerprint") != fps.get(old.contract_id)
                ):
                    self._dispose(old, old_node, state)
                    old_node.pop("trace", None)
        affected = affected_sources(
            config, ({trigger_source} if trigger_source else set()) | calendar_changed
        )
        previous_contracts = state.tables["contract_state_current"]
        state.tables["contract_state_current"] = {}
        for contract in topological(config):
            key = contract.contract_id
            lifecycle = state.tables["contract_lifecycle"].get(key)
            if not contract.enabled:
                state.tables["contract_lifecycle"][key] = {
                    "ever_active": bool(lifecycle and lifecycle.get("ever_active")),
                    "enabled": False,
                }
                continue
            inputs = self._inputs(contract, config, state)
            triggered = any(
                resolve_ref(item.ref, config)[0] in affected for item in contract.inputs
            )
            if triggered:
                affected.add(key)
            contract_origin = "revision" if origin == "input" and not triggered else origin
            if origin == "tick" and triggered:
                contract_origin = "input"
            if origin == "tick" and any(
                datetime.fromisoformat(at) <= now
                for at in state.tables["node_state"].get(key, {}).get("clock_due", [])
            ):
                contract_origin = "input"
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
            declaration = types.get(contract.type_id, contract.type_version)
            original_node = copy.deepcopy(node)
            original_latches = copy.deepcopy(self.pending_latches)
            refresh: set[str] = set()
            try:
                result, node, machine_state = declaration.evaluate(
                    self.clock,
                    self.pending_latches,
                    contract,
                    inputs,
                    node,
                    state,
                    contract_origin,
                    case,
                    (machine_override or {}).get(key),
                )
                for input_name in node.pop("refresh_requests", []):
                    if input_name not in declaration.refresh_inputs:
                        raise ValueError("undeclared refresh capability")
                    ref = next(i.ref for i in contract.inputs if i.name == input_name)
                    source_id, field = resolve_ref(ref, config)
                    if field is not None:
                        raise ValueError("refresh requires source binding")
                    refresh.add(source_id)
                fields = validate_fields(
                    declaration.schema,
                    {"value": result} if isinstance(result, FieldValue) else result,
                    now,
                    inputs,
                    declaration.grace_outputs,
                )
                self.pending_refresh.update(refresh)
            except Exception as error:
                evaluation_errors.add(key)
                LOGGER.error(
                    "evaluation_error",
                    extra={"contract_id": key, "error_type": type(error).__name__},
                )
                node, self.pending_latches, machine_state = original_node, original_latches, None
                fields = {
                    name: unknown(ReasonCode.EVALUATION_ERROR, key, now)
                    for name in declaration.schema.fields
                }
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
                fixture=declaration.schema.fixture,
            )
            state.tables["node_state"][key] = node
            state.tables["contract_lifecycle"][key] = {
                "ever_active": True,
                "enabled": True,
                "start_case": case,
            }
            data_envelope = envelope.model_dump(mode="json")
            previous_envelope = previous_contracts.get(key)
            # Reasons describe an interval; an unchanged reason retains its onset.
            if previous_envelope:
                for name, field in data_envelope["fields"].items():
                    old_reasons = previous_envelope["fields"].get(name, {}).get("reasons", [])
                    for reason in field["reasons"]:
                        old_reason = next(
                            (
                                r
                                for r in old_reasons
                                if all(
                                    r.get(k) == reason.get(k)
                                    for k in ("code", "input", "source_id", "detail")
                                )
                            ),
                            None,
                        )
                        if old_reason:
                            reason["since"] = old_reason["since"]
            volatile = {"computed_at", "published_at", "publication_seq"}
            same = previous_envelope is not None and {
                k: v for k, v in data_envelope.items() if k not in volatile
            } == {k: v for k, v in previous_envelope.items() if k not in volatile}
            state.tables["contract_state_current"][key] = (
                previous_envelope if same and previous_envelope is not None else data_envelope
            )
            if not same:
                state.tables["contract_state_history"][f"{seq}:{key}"] = data_envelope
            if machine_state:
                previous_sm = state.tables["sm_instance"].get(key)
                data = machine_state.model_dump(mode="json")
                state.tables["sm_instance"][key] = data
                if previous_sm != data:
                    state.tables["sm_episode"][machine_state.episode_id] = {
                        "contract_id": key,
                        **data,
                    }
                    state.tables["sm_transition"][str(uuid4())] = {"contract_id": key, **data}
                if machine_state.deadline and previous_sm != data:
                    state.tables["deadline"][machine_state.deadline.deadline_id] = {
                        "contract_id": key,
                        **machine_state.deadline.model_dump(mode="json"),
                    }
            elif declaration.machine_factory and not node.get("machine"):
                state.tables["sm_instance"].pop(key, None)
        if (
            state.tables["contract_state_history"]
            or previous_contracts.keys() != state.tables["contract_state_current"].keys()
            or state.active_revision != self.state.active_revision
            or state.epoch_id != self.state.epoch_id
        ):
            state.publication_seq = seq
            state.publications[seq] = {
                "created_at": now.isoformat(),
                "epoch_id": state.epoch_id,
                "registry_revision": state.active_revision,
            }
        return evaluation_errors

    def _dispose(self, contract: Contract, node: dict[str, Any], state: State) -> None:
        config = self.config
        types = registry_types(config, self.types) if config else self.types
        producer = types.get(contract.type_id, contract.type_version).evaluate
        if isinstance(producer, Producer) and node.get("producer_epoch") == state.epoch_id:
            try:
                producer.dispose(
                    Context(
                        self.clock,
                        self.pending_latches or {},
                        contract,
                        {},
                        node,
                        state,
                        "dispose",
                        "valid",
                        None,
                    )
                )
            except Exception as error:
                LOGGER.error(
                    "producer_dispose_failed",
                    extra={"contract_id": contract.contract_id, "error_type": type(error).__name__},
                )
            node.pop("producer_epoch", None)

    async def _command(self, state: State, command: Command) -> dict[str, Any]:
        digest, now = checksum(command), self.clock.now_utc()
        old = await self.store.get("command_log", command.command_id)
        if old:
            return old["result"] if old["digest"] == digest else {"status": "command_id_conflict"}
        config = self._config(state)
        contract = (
            next((c for c in config.contracts if c.contract_id == command.contract_id), None)
            if config
            else None
        )
        result: dict[str, Any] = {"command_id": command.command_id, "status": "not_supported"}
        declaration = (
            registry_types(config, self.types).get(contract.type_id, contract.type_version)
            if config and contract
            else None
        )
        override: dict[str, MachineState] = {}
        if command.valid_until <= now:
            result["status"] = "expired"
        elif command.issued_at > now or command.valid_until <= command.issued_at:
            result.update(status="rejected", reason="invalid_value")
        elif (
            command.expected_registry_revision is not None
            and command.expected_registry_revision != state.active_revision
        ):
            result.update(status="rejected", reason="active_revision_conflict")
        elif (
            contract and contract.enabled and config and declaration and declaration.machine_factory
        ):
            factory = declaration.machine_factory
            assert factory is not None
            machine = factory(contract.parameters)
            data = state.tables["node_state"].get(contract.contract_id, {}).get("machine")
            args_model = declaration.commands.get(command.command)
            args = command.args
            invalid_args = bool(args) and args_model is None
            if args_model:
                try:
                    args = args_model.model_validate(args, strict=True).model_dump()
                except ValidationError:
                    invalid_args = True
            if command.command not in machine.definition.commands:
                result["status"] = "not_supported"
            elif invalid_args:
                result.update(status="rejected", reason="invalid_value")
            elif not data:
                result.update(status="rejected", reason="state_unknown")
            else:
                try:
                    updated, status = machine.step(
                        MachineState.model_validate(data),
                        command.command,
                        self._inputs(contract, config, state),
                        now,
                        state.active_revision,
                        manual=True,
                        args=args,
                    )
                except GuardEvaluationError:
                    result.update(status="rejected", reason="evaluation_error")
                else:
                    result["status"] = (
                        "rejected" if status in {"guard_rejected", "guard_unknown"} else status
                    )
                    if status in {"guard_rejected", "guard_unknown"}:
                        result["reason"] = status
                    if status == "accepted":
                        override[contract.contract_id] = updated
        if override and config:
            evaluation_errors = self._evaluate(
                state, config, origin="command", machine_override=override
            )
            if command.contract_id in evaluation_errors:
                result.update(status="rejected", reason="evaluation_error")
        state.tables["command_log"][command.command_id] = {
            "digest": digest,
            "result": result,
            "at": now.isoformat(),
            "command": command.model_dump(mode="json"),
        }
        await self._commit(state, publication=bool(override))
        if result["status"] != "accepted":
            LOGGER.info(
                "command_rejected",
                extra={
                    "contract_id": command.contract_id,
                    "reason": result.get("reason", result["status"]),
                },
            )
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
            self.pending_refresh.clear()
            self._unavailable()
            raise
        previous_seq = self.state.publication_seq
        previous_contracts = self.state.tables["contract_state_current"]
        previously_needed_ha = self.requires_ha_snapshot
        self.state = state
        if not self.requires_ha_snapshot:
            self.ha = self.bridge = "not_needed"
            self.bridge_subscriptions = 0
            self.first_snapshot = False
            self.dependency_connections.pop("ha", None)
        elif not previously_needed_ha:
            self.ha = self.bridge = "disconnected"
            self.first_snapshot = False
        if self.pending_latches is not None:
            self.latches = self.pending_latches
            self.pending_latches = None
        self.persistence = True
        self.confirmed = True
        for source_id in self.pending_refresh:
            try:
                self.refresh_requests.put_nowait((state.active_revision, source_id))
            except asyncio.QueueFull:
                self.refresh_overflow += 1
                LOGGER.warning("refresh_queue_overflow")
        self.pending_refresh.clear()
        self.commit_duration = self.clock.monotonic() - started
        self._plan_evaluation()
        for key, envelope in state.tables["contract_state_current"].items():
            previous_fields = previous_contracts.get(key, {}).get("fields", {})
            for name, field in envelope["fields"].items():
                old = previous_fields.get(name, {}).get("status")
                if old != field["status"]:
                    LOGGER.info(
                        "quality_transition",
                        extra={
                            "contract_id": key,
                            "field": name,
                            "previous_status": old,
                            "status": field["status"],
                        },
                    )
        if resync:
            self._broadcast({"type": "resync_required", "reason": "epoch"})
        elif publication and state.publication_seq != previous_seq:
            self._broadcast(
                {
                    "type": "delta",
                    "publication_seq": state.publication_seq,
                    "prev_seq": previous_seq,
                    "epoch_id": state.epoch_id,
                    "registry_revision": state.active_revision,
                    "contracts": state.tables["contract_state_current"],
                }
            )

    def _calendar_observations(self, state: State, config: RegistryConfig, origin: str) -> set[str]:
        changed: set[str] = set()
        now = self.clock.now_utc()
        for binding in config.bindings:
            calendar = binding.adapter.calendar
            if calendar is None and binding.adapter.kind != "connectivity":
                continue
            if calendar is not None:
                value, _ = project(calendar, now)
            else:
                value = (
                    "ready"
                    if self.bridge == "connected" and self.ha == "connected"
                    else "starting"
                    if self.ha in {"starting", "stopping"}
                    else "unavailable"
                    if self.bridge == "unavailable"
                    else None
                )
            old = state.tables["source_observation_current"].get(binding.binding_id)
            if old and old.get("value_raw") == value and old.get("observation_kind") != "restore":
                continue
            observation = Observation(
                source_id=binding.source_id,
                binding_id=binding.binding_id,
                adapter="scheduler" if calendar is not None else "connectivity",
                value_raw=value,
                device_time=now,
                received_at=now,
                observation_kind="snapshot" if origin in {"restore", "revision"} else "live_change",
                epoch_id=state.epoch_id,
                ingest_seq=int(old["ingest_seq"]) + 1 if old else 0,
                reference_version=2,
                registry_revision=state.active_revision,
                availability="available" if value is not None else "unknown",
            )
            state.tables["source_observation_current"][binding.binding_id] = (
                observation.storage_document()
            )
            state.tables["source_observation_history"][observation.reference] = (
                observation.storage_document()
            )
            changed.add(binding.source_id)
        return changed

    def _plan_evaluation(self) -> None:
        now = self.clock.now_utc()
        due: list[datetime] = []
        config = self.config
        if config:
            due.extend(
                project(binding.adapter.calendar, now)[1]
                for binding in config.bindings
                if binding.adapter.calendar is not None
            )
            types = registry_types(config, self.types)
            bindings = {b.source_id: b.binding_id for b in config.bindings}
            observations = self.state.tables["source_observation_current"]
            for source in config.sources:
                for measured_source in {
                    source.source_id,
                    source.freshness.liveness_source or source.source_id,
                }:
                    raw = observations.get(bindings.get(measured_source, ""))
                    if raw:
                        stamp = Observation.model_validate(raw).measurement
                        if stamp:
                            due.append(
                                stamp - timedelta(seconds=source.freshness.future_tolerance_s)
                            )
                            if source.freshness.interval_s is not None:
                                due.append(
                                    stamp
                                    + timedelta(seconds=source.freshness.interval_s, microseconds=1)
                                )
            for contract in config.contracts:
                callback = types.get(contract.type_id, contract.type_version).next_due
                if callback and contract.enabled:
                    try:
                        at = callback(
                            contract.parameters,
                            self.state.tables["node_state"].get(contract.contract_id, {}),
                            now,
                        )
                    except ValueError, TypeError, KeyError, AttributeError:
                        # Invalid persisted context is already degraded by evaluation;
                        # a scheduling hint must never undo a committed publication.
                        at = None
                    if at:
                        due.append(at)
        self.next_evaluation = min((at for at in due if at > now), default=None)
        if self.evaluation_alarm:
            self.evaluation_alarm.cancel()
        if (
            self.next_evaluation
            and config
            and (
                any(b.adapter.calendar for b in config.bindings)
                or any(node.get("clock_due") for node in self.state.tables["node_state"].values())
            )
        ):
            self.evaluation_alarm = self.clock.call_at_utc(self.next_evaluation, self.tick)

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
        if self.persistence and self.state.epoch_id in self.state.tables["runtime_epoch"]:
            state = self.state.clone()
            if self.config:
                for contract in self.config.contracts:
                    self._dispose(
                        contract, state.tables["node_state"].get(contract.contract_id, {}), state
                    )
            state.tables["runtime_epoch"][state.epoch_id]["ended_at"] = (
                self.clock.now_utc().isoformat()
            )
            await self._commit(state)
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
