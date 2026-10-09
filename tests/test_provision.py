import base64
import json
from uuid import uuid4

import pytest

from core_contracts import provision


def request():
    return {
        "request_id": str(uuid4()),
        "connection": {
            "host": "postgres-test",
            "port": 5432,
            "database": "cc_test",
            "user": "cc_test",
            "sslmode": "verify-full",
            "ca": "",
        },
    }


class Server:
    def __init__(self, spec):
        self.marker = "core-contracts-setup:" + spec["request_id"]
        self.role_exists = self.db_exists = False
        self.role_marker = self.db_marker = ""
        self.statements = []

    def sql(self, statement, database="postgres"):
        self.statements.append(statement)
        if statement.startswith("SELECT rolsuper"):
            return "t"
        if statement == "SHOW server_version_num":
            return "170000"
        if statement.startswith("SELECT coalesce(shobj_description"):
            return self.role_marker if "pg_authid" in statement else self.db_marker
        if statement.startswith("SELECT EXISTS"):
            return "t" if (self.role_exists if "pg_roles" in statement else self.db_exists) else "f"
        if statement.startswith("SELECT pg_get_userbyid"):
            return "cc_test"
        if statement.startswith("SELECT count"):
            return "0"
        if statement.startswith("BEGIN; CREATE ROLE"):
            self.role_exists = True
            self.role_marker = self.marker
        if statement.startswith("CREATE DATABASE"):
            self.db_exists = True
        if statement.startswith("COMMENT ON DATABASE"):
            self.db_marker = self.marker
        return ""


def test_provision_idempotent_private_password_not_in_sql(tmp_path, monkeypatch):
    spec = request()
    server = Server(spec)
    monkeypatch.setattr(provision, "sql", server.sql)
    first = provision.provision(spec, tmp_path)
    again = provision.provision(spec, tmp_path)
    assert first == again
    decoded = json.loads(base64.b64decode(first))
    password = decoded["connection"]["password"]
    assert len(password) >= 64
    assert password not in "\n".join(server.statements)
    assert "SCRAM-SHA-256$" in "\n".join(server.statements)
    assert sum(statement.startswith("BEGIN; CREATE ROLE") for statement in server.statements) == 1
    assert sum(statement.startswith("CREATE DATABASE") for statement in server.statements) == 1


@pytest.mark.parametrize("kind", ["role", "database"])
def test_foreign_objects_never_changed(tmp_path, monkeypatch, kind):
    spec = request()
    server = Server(spec)
    server.role_exists = kind == "role"
    server.db_exists = kind == "database"
    monkeypatch.setattr(provision, "sql", server.sql)
    with pytest.raises(RuntimeError, match=f"existing_{kind}_conflict"):
        provision.provision(spec, tmp_path)
    assert all(statement.startswith(("SELECT", "SHOW")) for statement in server.statements)


def test_interrupted_role_or_database_creation_resumes_without_password_reset(
    tmp_path, monkeypatch
):
    spec = request()
    server = Server(spec)
    monkeypatch.setattr(provision, "sql", server.sql)
    original = provision.save
    stopped = False

    def fail_after_intent(path, value):
        nonlocal stopped
        original(path, value)
        if value["database_creating"] and not stopped:
            stopped = True
            raise OSError("interrupted")

    monkeypatch.setattr(provision, "save", fail_after_intent)
    with pytest.raises(OSError):
        provision.provision(spec, tmp_path)
    code = provision.provision(spec, tmp_path)
    assert json.loads(base64.b64decode(code))["request_id"] == spec["request_id"]
    assert sum(statement.startswith("BEGIN; CREATE ROLE") for statement in server.statements) == 1


def test_psql_no_password_arguments_and_error_output_is_not_reflected(monkeypatch):
    from types import SimpleNamespace

    calls = []

    def failed(args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(returncode=1, stdout="secret", stderr="password=secret")

    monkeypatch.setattr(provision.subprocess, "run", failed)
    with pytest.raises(RuntimeError) as error:
        provision.sql("SELECT 1")
    assert "password=secret" not in str(error.value)
    assert "log_statement='none'" in calls[0][1]["input"]
    assert not any("password" in arg for arg in calls[0][0])


def test_identifiers_reject_sql_and_reserved_paths():
    for value in ("bad;DROP", "../data", "UPPER", "a" * 64):
        with pytest.raises(RuntimeError):
            provision.identifier(value)
