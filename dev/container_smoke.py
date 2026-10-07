"""Isolated Docker smoke; creates and removes only uniquely named test resources."""

import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from core_contracts.clock import SystemClock


def docker(*args, check=True):
    result = subprocess.run(["docker", *args], capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError("Docker smoke operation failed: " + args[0])
    return result


async def main():
    image = sys.argv[1]
    prefix = "cc-smoke-" + uuid4().hex[:10]
    network, db, app, volume = (prefix + suffix for suffix in ("-net", "-db", "-app", "-data"))
    clock = SystemClock()
    options = {
        "postgres_host": "postgres",
        "postgres_port": 5432,
        "postgres_database": "core_contracts_test",
        "postgres_user": "postgres",
        "postgres_password": "",
        "postgres_sslmode": "disable",
        "postgres_ca": "",
        "installation_label": "Synthetic container smoke",
        "initialize_empty_database": False,
        "adopt_installation_id": "",
        "mqtt_mode": "disabled",
        "mqtt_host": "",
        "mqtt_port": 1883,
        "mqtt_username": "",
        "mqtt_password": "",
        "log_level": "INFO",
        "log_format": "json",
    }

    def inside(code):
        return docker("exec", app, "python", "-c", code).stdout.strip()

    def health(path):
        return json.loads(
            inside(
                "import json,urllib.request,urllib.error\ntry:\n r=urllib.request.urlopen('http://127.0.0.1:8787/health/"
                + path
                + "',timeout=2)\nexcept urllib.error.HTTPError as e:\n r=e\nprint(json.dumps({'status':r.status,'body':json.load(r)}))"
            )
        )

    async def eventually(predicate):
        for _ in range(60):
            try:
                if predicate():
                    return
            except RuntimeError, ValueError:
                # A failed probe is retried only within this bounded startup smoke.
                await clock.sleep(0.5)
                continue
            await clock.sleep(0.5)
        raise AssertionError("Container smoke readiness deadline exceeded")

    try:
        docker("network", "create", network)
        docker("volume", "create", volume)
        docker(
            "create",
            "--name",
            app,
            "--network",
            network,
            "--init",
            "--mount",
            f"type=volume,source={volume},target=/data",
            image,
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "options.json"
            path.write_text(json.dumps(options))
            docker("cp", str(path), app + ":/data/options.json")
        docker("start", app)
        # DB initially absent: liveness must stay up, not restart the process.
        await eventually(lambda: health("live")["status"] == 200)
        assert health("ready")["status"] == 503
        docker(
            "run",
            "-d",
            "--name",
            db,
            "--network",
            network,
            "--network-alias",
            "postgres",
            "-e",
            "POSTGRES_HOST_AUTH_METHOD=trust",
            "-e",
            "POSTGRES_DB=core_contracts_test",
            "postgres:17-bookworm",
        )
        await eventually(
            lambda: (
                inside(
                    "from pathlib import Path; print((Path('/data/secrets/admin_token')).is_file())"
                )
                == "True"
            )
        )
        # Inspect the actual long-lived app process, not the root docker-exec inspector.
        code = "from pathlib import Path\nfor p in Path('/proc').glob('[0-9]*'):\n cmd=(p/'cmdline').read_bytes().split(b'\\0')\n if b'core_contracts.app' in cmd:\n  print(next(x for x in (p/'status').read_text().splitlines() if x.startswith('Uid:')).split()[1])"
        assert inside(code) == "10001"
        assert (
            inside(
                "from pathlib import Path; print(oct(Path('/data/secrets/admin_token').stat().st_mode & 511))"
            )
            == "0o600"
        )
        request = "import urllib.request,json; from pathlib import Path; token=Path('/data/secrets/admin_token').read_text(); req=urllib.request.Request('http://127.0.0.1:8787/api/v1/info',headers={'Authorization':'Bearer '+token}); print(json.load(urllib.request.urlopen(req))['installation_id'])"
        identity = inside(request)
        assert len(identity) == 36
        registry = json.loads(
            (
                Path(__file__).resolve().parents[1] / "docs/platform-alpha1/example-registry.json"
            ).read_text()
        )
        activate_code = (
            "import urllib.request,json; from pathlib import Path\ntoken=Path('/data/secrets/admin_token').read_text()\ndef post(path,data):\n req=urllib.request.Request('http://127.0.0.1:8787/api/v1/'+path,data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})\n return json.load(urllib.request.urlopen(req))\ndraft=post('registry/drafts',"
            + repr(registry)
            + ")\nrevision=post('registry/drafts/'+draft['draft_id']+'/activate',{'draft_version':1,'expected_active_revision':0})\nprint(revision['revision'])"
        )
        assert inside(activate_code) == "1"
        docker("stop", db)
        await eventually(
            lambda: health("ready")["body"].get("persistence") == "persistence_unavailable"
        )
        assert health("live")["status"] == 200
        assert docker("inspect", "-f", "{{.State.Running}}", app).stdout.strip() == "true"
        docker("start", db)
        await eventually(lambda: health("ready")["body"].get("persistence") == "available")
        assert inside(request) == identity
        started = clock.monotonic()
        docker("stop", "--time", "30", app)
        assert clock.monotonic() - started < 30
        assert docker("inspect", "-f", "{{.State.ExitCode}}", app).stdout.strip() == "0"
        print(
            "PASS: initial DB outage, non-root UID, token permissions, DB outage/recovery, identity, SIGTERM"
        )
    finally:
        docker("rm", "-f", app, db, check=False)
        docker("volume", "rm", volume, check=False)
        docker("network", "rm", network, check=False)


if __name__ == "__main__":
    asyncio.run(main())
