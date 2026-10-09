"""Standalone generated LXC script. Run as postgres with local peer authentication.

Save script privately; execute with `sudo -u postgres python3 /private/path/setup.py`.
Never paste the secret output into shell commands, URLs, issues or diagnostic logs.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import subprocess
from pathlib import Path
from typing import Any
from uuid import UUID

REQUEST: dict[str, Any] | None
REQUEST = None


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def identifier(value: str) -> str:
    if (
        not value
        or len(value) > 63
        or not value[0].islower()
        or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789_" for c in value)
    ):
        raise RuntimeError("invalid_identifier")
    return '"' + value + '"'


def sql(statement: str, database: str = "postgres") -> str:
    result = subprocess.run(
        ["psql", "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", database],
        input=(
            "SET log_statement='none'; SET log_min_error_statement='panic'; "
            "SET log_min_duration_statement=-1; SET log_min_duration_sample=-1; "
            "SET log_transaction_sample_rate=0; " + statement
        ),
        text=True,
        capture_output=True,
        check=False,
        env={k: v for k, v in os.environ.items() if not k.startswith("PG")},
    )
    if result.returncode:
        # PostgreSQL errors may quote a password statement: never echo stdout/stderr.
        raise RuntimeError("provision_sql_failed; inspect server state without exposing secrets")
    return result.stdout.strip()


def verifier(password: str) -> str:
    # PostgreSQL accepts a SCRAM verifier. Plaintext never enters SQL/psql input.
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 4096)
    client = hmac.digest(salted, b"Client Key", "sha256")
    server = hmac.digest(salted, b"Server Key", "sha256")

    def encode(value: bytes) -> str:
        return base64.b64encode(value).decode()

    return f"SCRAM-SHA-256$4096:{encode(salt)}${encode(hashlib.sha256(client).digest())}:{encode(server)}"


def save(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(state, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def provision(request: dict[str, Any], directory: Path | None = None) -> str:
    if str(UUID(request["request_id"])) != request["request_id"]:
        raise RuntimeError("invalid_request_id")
    directory = directory or Path.home() / ".core-contracts-setup"
    if directory.is_symlink():
        raise RuntimeError("unsafe_resume_path")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = directory / (request["request_id"] + ".lock")
    if lock.is_symlink():
        raise RuntimeError("unsafe_resume_path")
    fd = os.open(lock, os.O_RDWR | os.O_CREAT, 0o600)
    with os.fdopen(fd, "a+"):
        if os.name == "posix":
            import importlib

            fcntl = importlib.import_module("fcntl")
            fcntl.flock(fd, fcntl.LOCK_EX)
        return _provision(request, directory)


def _provision(request: dict[str, Any], directory: Path) -> str:
    if sql("SELECT rolsuper FROM pg_roles WHERE rolname=current_user") != "t":
        raise RuntimeError("run_as_postgres_with_local_peer_authentication")
    if int(sql("SHOW server_version_num")) < 140000:
        raise RuntimeError("postgres_14_required")
    config = request["connection"]
    role, database = identifier(config["user"]), identifier(config["database"])
    marker = "core-contracts-setup:" + request["request_id"]
    path = directory / (request["request_id"] + ".json")
    if path.is_symlink() or path.parent.is_symlink():
        raise RuntimeError("unsafe_resume_path")
    state: dict[str, Any] = (
        json.loads(path.read_text())
        if path.exists()
        else {"request": request, "password": secrets.token_urlsafe(48), "database_creating": False}
    )
    if state["request"] != request:
        raise RuntimeError("resume_request_mismatch")
    save(path, state)
    role_name, db_name = literal(config["user"]), literal(config["database"])
    role_marker = sql(
        "SELECT coalesce(shobj_description(oid,'pg_authid'),'') FROM pg_roles WHERE rolname="
        + role_name
    )
    role_exists = (
        sql("SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=" + role_name + ")") == "t"
    )
    if role_exists and role_marker != marker:
        raise RuntimeError("existing_role_conflict; no changes made to existing role")
    db_exists = sql("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=" + db_name + ")") == "t"
    db_marker = sql(
        "SELECT coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname="
        + db_name
    )
    if db_exists and db_marker != marker:
        owner = sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=" + db_name)
        # CREATE DATABASE cannot share a transaction with COMMENT. Resume only our
        # previously recorded create intent, marked owner and still-empty database.
        if not (
            state["database_creating"]
            and role_marker == marker
            and owner == config["user"]
            and sql(
                "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')",
                config["database"],
            )
            == "0"
        ):
            raise RuntimeError("existing_database_conflict; no changes made to existing database")
    if not role_exists:
        sql(
            "BEGIN; CREATE ROLE " + role + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS PASSWORD "
            + literal(verifier(state["password"]))
            + "; COMMENT ON ROLE "
            + role
            + " IS "
            + literal(marker)
            + "; COMMIT;"
        )
    if not db_exists:
        state["database_creating"] = True
        save(path, state)
        sql("CREATE DATABASE " + database + " OWNER " + role)
    sql("COMMENT ON DATABASE " + database + " IS " + literal(marker))
    sql("REVOKE ALL ON DATABASE " + database + " FROM PUBLIC")
    sql(
        "REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT ALL ON SCHEMA public TO " + role,
        config["database"],
    )
    state["database_creating"] = False
    save(path, state)
    # Deliberate single secret output to an interactive terminal; no logs/URLs.
    return base64.b64encode(
        json.dumps(
            {
                "request_id": request["request_id"],
                "connection": {**config, "password": state["password"]},
            }
        ).encode()
    ).decode()


if __name__ == "__main__":
    try:
        if REQUEST is None:
            raise RuntimeError("generate_this_script_in_the_setup_wizard")
        if not os.isatty(1):
            raise RuntimeError("secret_output_requires_interactive_terminal")
        print("GEHEIM: Importcode nur in den Wizard einfügen; nicht protokollieren.")
        print(provision(REQUEST))
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        # Own errors are static. JSON/OS exceptions may contain paths, not echoed.
        print(str(error) if type(error) is RuntimeError else "provision_failed")
        raise SystemExit(1) from None
