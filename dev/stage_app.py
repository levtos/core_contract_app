"""Stage an unpacked local Supervisor repository without duplicating tracked source."""

import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
if destination.exists():
    raise SystemExit("Destination must not exist; choose a new staging directory")
app = destination / "core_contracts"
app.mkdir(parents=True)
shutil.copy2(root / "repository.yaml", destination)
for name in ("src", "migrations", "frontend", "core_contracts"):
    shutil.copytree(
        root / name,
        app / name,
        ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__"),
    )
for name in ("pyproject.toml", "uv.lock"):
    shutil.copy2(root / name, app)
for name in ("Dockerfile", "DOCS.md", "CHANGELOG.md"):
    shutil.copy2(root / "core_contracts" / name, app / name)
config = (root / "core_contracts/config.yaml").read_text(encoding="utf-8")
# Local builds deliberately have no prebuilt image requirement.
(app / "config.yaml").write_text(
    "\n".join(line for line in config.splitlines() if not line.startswith("image:")) + "\n",
    encoding="utf-8",
)
print(
    "Local repository staged; copy it to the Supervisor local apps directory for the human smoke gate."
)
