"""Version availability is editorial metadata, separate from immutable semantics."""

from typing import Literal

Lifecycle = Literal["active", "deprecated", "retired"]
EDITORIAL = {"display_name", "description", "lifecycle", "reactivation_note"}


def transition_allowed(
    previous: str, next_state: str, note: str | None, old_note: str | None
) -> bool:
    return (
        previous == next_state
        or (previous, next_state) in {("active", "deprecated"), ("deprecated", "retired")}
        or (next_state == "active" and bool(note and note.strip()) and note != old_note)
    )
