"""Run the actual CI shell step with a real local process through exit paths."""

import os
import shlex
import socket
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(os.name != "posix", reason="CI uses Linux bash/process signals")


@pytest.mark.parametrize("outcome", ["success", "test_failure", "engine_failure"])
def test_ci_reaps_its_engine_and_preserves_test_failure(tmp_path, outcome):
    workflow = yaml.load((ROOT / ".github/workflows/ci.yml").read_text(), Loader=yaml.BaseLoader)
    script = next(
        step["run"]
        for step in workflow["jobs"]["workbench-e2e"]["steps"]
        if step.get("name") == "Workbench end-to-end"
    )
    # Isolated workspace, actual child/server, and no HA/DB or application npm invocation.
    (tmp_path / ".venv/bin").mkdir(parents=True)
    (tmp_path / ".venv/bin/python").symlink_to(sys.executable)
    (tmp_path / "dev").mkdir()
    (tmp_path / "dev/workbench_demo.py").write_text(
        "import os,sys\n"
        "from pathlib import Path\n"
        "from http.server import BaseHTTPRequestHandler,HTTPServer\n"
        "Path('engine.pid').write_text(str(os.getpid()))\n"
        "if os.environ['CI_TEST_OUTCOME']=='engine_failure': sys.exit(2)\n"
        "class Handler(BaseHTTPRequestHandler):\n"
        " def do_GET(self):\n"
        "  self.send_response(200); self.end_headers(); self.wfile.write(b'[]')\n"
        "HTTPServer(('127.0.0.1',int(sys.argv[-1])),Handler).serve_forever()\n"
    )
    tools_dir = tmp_path / "tools"
    tools_dir.mkdir()
    npm = tools_dir / "npm"
    npm.write_text(
        "#!/bin/bash\n"
        f"{shlex.quote(sys.executable)} -c "
        + shlex.quote(
            "import os,urllib.request; from pathlib import Path; "
            "os.kill(int(Path('engine.pid').read_text()),0); "
            "assert urllib.request.urlopen(os.environ['MIMIR_E2E_URL']).status==200; "
            "Path('tests-ran').write_text('engine alive')"
        )
        + "\n"
        'if [ "$CI_TEST_OUTCOME" = test_failure ]; then exit 23; fi\n'
    )
    npm.chmod(0o755)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    result = subprocess.run(
        ["bash", "-e", "-c", script],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": str(tools_dir) + os.pathsep + os.environ["PATH"],
            "MIMIR_E2E_PORT": str(port),
            "CI_TEST_OUTCOME": outcome,
        },
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == {"success": 0, "test_failure": 23, "engine_failure": 1}[outcome]
    assert (tmp_path / "tests-ran").exists() == (outcome != "engine_failure")
    pid = int((tmp_path / "engine.pid").read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
