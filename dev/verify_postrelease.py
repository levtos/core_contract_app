"""Before tagging: uv run python dev/verify_postrelease.py (fetches origin tags)."""

from version_gate import main

if __name__ == "__main__":
    main()
