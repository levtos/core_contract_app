import subprocess
from pathlib import Path

import pytest
import yaml

from dev.version_gate import compare_tags


@pytest.fixture
def tagged_repo(tmp_path):
    def run(*args):
        subprocess.run(["git", "-C", str(tmp_path), *args], check=True, capture_output=True)

    run("init")
    run("config", "user.name", "Version test")
    run("config", "user.email", "version@example.invalid")

    def tag(name, slug):
        path = tmp_path / "an-arbitrary-directory/config.yaml"
        path.parent.mkdir(exist_ok=True)
        path.write_text(yaml.safe_dump({"slug": slug, "version": name.removeprefix("v")}))
        run("add", ".")
        run("commit", "-m", name)
        run("tag", name)

    return tmp_path, tag


def test_slug_is_read_from_each_tag_and_not_its_directory(tagged_repo):
    root, tag = tagged_repo
    tag("v1.0.0a7.post1", "core_contracts")
    tag("v1.0.0a7", "mimir")
    report = compare_tags(root, "1.0.0a8", "mimir", ["v1.0.0a7.post1", "v1.0.0a7"])
    assert report["passed"]
    other = next(row for row in report["comparisons"] if row["tag"].endswith("post1"))
    assert other["classification"] == "andere App" and not other["newer"]
    (root / "an-arbitrary-directory/config.yaml").write_text("slug: unrelated\n")
    assert compare_tags(root, "1.0.0a8", "mimir", ["v1.0.0a7.post1"])["passed"]


def test_wrong_same_slug_and_any_older_tag_block(tagged_repo):
    root, tag = tagged_repo
    tag("v1.0.0a7.post1", "mimir")
    tag("v1.0.0a6", "mimir")
    assert not compare_tags(root, "1.0.0a8", "mimir", ["v1.0.0a7.post1", "v1.0.0a6"])["passed"]


def test_missing_metadata_and_suffix_fail(tagged_repo):
    root, tag = tagged_repo
    tag("v1.0.0a1", "mimir")
    for candidate in ("1.0.0a8.post1", "1.0.0a8.dev1", "1.0.0a1"):
        assert not compare_tags(root, candidate, "mimir", ["v1.0.0a1"])["passed"]
    assert not compare_tags(root, "1.0.0a8", "mimir", [])["passed"]
    assert not compare_tags(root, "1.0.0a8", "mimir", ["v9.0.0"])["passed"]


def test_terra_app_store_entry_is_unchanged():
    root = Path(__file__).resolve().parents[1]
    original = subprocess.check_output(
        ["git", "-C", str(root), "show", "a08a51d:core_contracts/config.yaml"]
    )
    assert (root / "core_contracts/config.yaml").read_bytes() == original
    mimir = yaml.safe_load((root / "mimir/config.yaml").read_text(encoding="utf-8"))
    assert mimir["slug"] == "mimir" and mimir["name"] == "Mimir"
    assert mimir["image"] == "ghcr.io/levtos/{arch}-mimir"
