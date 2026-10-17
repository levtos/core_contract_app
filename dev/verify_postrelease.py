"""Reproduce the Supervisor version-order gate without contacting Home Assistant.

uv run --with awesomeversion==25.8.0 python dev/verify_postrelease.py
"""

import json
import tomllib
from importlib.metadata import version
from pathlib import Path

import yaml
from awesomeversion import AwesomeVersion

root = Path(__file__).resolve().parents[1]
old = AwesomeVersion("1.0.0a7")
app = yaml.safe_load((root / "core_contracts/config.yaml").read_text(encoding="utf-8"))["version"]
python = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
frontend = json.loads((root / "frontend/package.json").read_text(encoding="utf-8"))["version"]
new = AwesomeVersion(app)
assert app == python == frontend == "1.0.0a7.post1"
assert new.valid and new > old
print(
    json.dumps(
        {
            "awesomeversion": version("awesomeversion"),
            "old": str(old),
            "new": str(new),
            "strategy": str(new.strategy),
            "valid": new.valid,
            "newer": new > old,
            "app_python_frontend_agree": True,
            "alpha8_newer_than_post1": AwesomeVersion("1.0.0a8") > new,
        },
        indent=2,
    )
)
