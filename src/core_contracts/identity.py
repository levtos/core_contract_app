"""Installation identity requires explicit adoption or database initialization."""

import json
import os
from pathlib import Path
from uuid import UUID, uuid4


def reconcile(
    local: str | None,
    database: str | None,
    *,
    initialize_empty_database: bool,
    adopt_installation_id: str | None,
) -> str:
    for value in (local, database, adopt_installation_id):
        if value is not None and UUID(value).version != 4:
            raise ValueError("invalid_installation_id")
    if local and database:
        if local != database:
            raise ValueError("installation_mismatch")
        return local
    if local:
        if not initialize_empty_database:
            raise ValueError("initialize_empty_database_required")
        return local
    if database:
        if adopt_installation_id != database:
            raise ValueError("adopt_installation_id_required")
        return database
    return str(uuid4())


def write_private(path: Path, value: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".new")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def load_id(directory: Path) -> str | None:
    path = directory / "installation.json"
    if not path.exists():
        return None
    value: str = json.loads(path.read_text(encoding="utf-8"))["installation_id"]
    return value
