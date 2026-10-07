"""Declarative, code-owned state machines; commands request guarded transitions."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import uuid4

from .model import Model
from .quality import FieldValue, ReasonCode, unknown
from .temporal import Deadline

Guard = Callable[[dict[str, FieldValue], datetime], bool]


@dataclass(frozen=True)
class Transition:
    source: str
    target: str
    event: str
    guard: Guard
    reason: str
    new_episode: bool = False
    ends_episode: bool = False


@dataclass(frozen=True)
class Definition:
    states: tuple[str, ...]
    initial: str
    transitions: tuple[Transition, ...]
    commands: tuple[str, ...]
    deadline_seconds: float | None = None
    sessions: bool = False

    def __post_init__(self) -> None:
        if self.initial not in self.states or len(set(self.states)) != len(self.states):
            raise ValueError("invalid states")
        for transition in self.transitions:
            if transition.source not in self.states or transition.target not in self.states:
                raise ValueError("invalid transition")


class MachineState(Model):
    state: str
    since_at: datetime
    previous_state: str | None = None
    episode_id: str
    episode_started_at: datetime
    episode_ended_at: datetime | None = None
    session_id: str | None = None
    transition_reason: str
    trigger: str
    source: str
    evidence: tuple[str, ...] = ()
    registry_revision: int
    origin: Literal["automatic", "manual", "restore"]
    fingerprint: str
    deadline: Deadline | None = None


class Machine:
    def __init__(self, definition: Definition) -> None:
        self.definition = definition

    def initial(self, now: datetime, revision: int, fingerprint: str) -> MachineState:
        episode = str(uuid4())
        return MachineState(
            state=self.definition.initial,
            since_at=now,
            episode_id=episode,
            episode_started_at=now,
            transition_reason="initial",
            trigger="first_start",
            source="runtime",
            registry_revision=revision,
            origin="automatic",
            fingerprint=fingerprint,
            session_id=str(uuid4()) if self.definition.sessions else None,
            deadline=self._deadline(episode, now),
        )

    def _deadline(self, episode: str, now: datetime) -> Deadline | None:
        seconds = self.definition.deadline_seconds
        return (
            Deadline(
                deadline_id=str(uuid4()), episode_id=episode, at=now + timedelta(seconds=seconds)
            )
            if seconds is not None
            else None
        )

    def step(
        self,
        state: MachineState,
        event: str,
        inputs: dict[str, FieldValue],
        now: datetime,
        revision: int,
        *,
        manual: bool = False,
    ) -> tuple[MachineState, str]:
        if manual and event not in self.definition.commands:
            return state, "not_supported"
        for rule in self.definition.transitions:
            if rule.source != state.state or rule.event != event:
                continue
            if not rule.guard(inputs, now):
                return state, "guard_rejected"
            episode = str(uuid4()) if rule.new_episode else state.episode_id
            deadline = self._deadline(episode, now) if rule.new_episode else state.deadline
            if event == "deadline" and deadline:
                deadline = deadline.model_copy(update={"fired": True})
            return state.model_copy(
                update={
                    "state": rule.target,
                    "previous_state": state.state,
                    "since_at": now,
                    "episode_id": episode,
                    "episode_started_at": now if rule.new_episode else state.episode_started_at,
                    "episode_ended_at": now if rule.ends_episode else None,
                    "transition_reason": rule.reason,
                    "trigger": event,
                    "source": "command" if manual else "input",
                    "evidence": tuple(e for i in inputs.values() for e in i.evidence),
                    "registry_revision": revision,
                    "origin": "manual" if manual else "automatic",
                    "deadline": deadline,
                }
            ), "accepted"
        return state, "guard_rejected" if manual else "unchanged"

    def validate_restore(
        self, state: MachineState, fingerprint: str, now: datetime
    ) -> FieldValue | None:
        if state.fingerprint != fingerprint or state.state not in self.definition.states:
            return unknown(ReasonCode.RESTORE_INCOMPATIBLE, "state_machine", now)
        if state.deadline and state.deadline.episode_id != state.episode_id:
            return unknown(ReasonCode.RESTORE_MISSING, "deadline", now)
        return None
