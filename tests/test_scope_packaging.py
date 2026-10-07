import ast
import json
from pathlib import Path

import yaml

from core_contracts.registry import validate
from core_contracts.testing.contract_types import type_registry

ROOT = Path(__file__).resolve().parents[1]


def test_no_domain_registration_outside_testing():
    domain_terms = {
        "opening",
        "window",
        "fenster",
        "door",
        "presence",
        "bio",
        "sleep",
        "activity",
        "gaming",
        "media",
        "climate",
        "heating",
        "blind",
        "light",
        "day_phase",
        "wake",
    }
    for path in (ROOT / "src").rglob("*.py"):
        if "testing" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "ContractType"
            ):
                raise AssertionError(
                    f"Only fixture packages may register contract types: {path.name}"
                )
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                assert not any(node.value.startswith(term + ".v") for term in domain_terms)


def test_example_registry_and_no_forbidden_context():
    config = validate(
        json.loads((ROOT / "docs/platform-alpha1/example-registry.json").read_text()),
        type_registry(),
    )
    assert len(config.contracts) == 5
    assert all(c.type_id.startswith("test.") for c in config.contracts)
    for forbidden in (
        "profile",
        "profile_id",
        "consumer_ids",
        "shadow",
        "published",
        "safe_default",
        "hold_last",
        "set_state",
    ):
        assert forbidden not in type(config).model_fields


def test_watchdog_security_and_container():
    config = yaml.safe_load((ROOT / "core_contracts/config.yaml").read_text())
    assert config["watchdog"].endswith("/health/live")
    assert config["hassio_api"] is False and config["homeassistant_api"] is True
    assert config["ports"]["8787/tcp"] is None
    assert config["arch"] == ["amd64", "aarch64"]
    assert not any(config.get(key) for key in ("privileged", "docker_api", "host_network"))
    docker = (ROOT / "core_contracts/Dockerfile").read_text()
    assert "BUILD_FROM" not in docker and "uv sync --frozen" in docker
    assert not (ROOT / "core_contracts/build.yaml").exists()
    entry = (ROOT / "core_contracts/rootfs/entrypoint.sh").read_text()
    assert "setpriv --reuid=10001 --regid=10001" in entry


def test_bridge_has_no_domain_or_await_in_subscription():
    path = ROOT / "custom_components/core_contracts_bridge/__init__.py"
    tree = ast.parse(path.read_text())
    subscribe = next(
        n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "subscribe"
    )
    assert not any(isinstance(n, ast.Await) for n in ast.walk(subscribe))
    imports = [n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)]
    assert not any(name.startswith("core_contracts.") for name in imports)
    text = path.read_text()
    assert "async_track_state_report_event" in text and "require_admin" in text


def test_client_supports_declared_python_minimum():
    for path in (ROOT / "client/core_contracts_client").glob("*.py"):
        ast.parse(path.read_text(), feature_version=(3, 12))
