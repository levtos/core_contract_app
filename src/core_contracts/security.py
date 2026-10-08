"""Installation-scoped tokens, constant-time comparisons and bounded rate limits."""

import secrets
from collections import OrderedDict
from pathlib import Path

from .clock import Clock
from .identity import write_private


class Tokens:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.values: dict[str, str] = {}
        for role in ("consumer", "admin"):
            path = directory / f"{role}_token"
            if path.exists():
                token = path.read_text(encoding="utf-8").strip()
                if len(token) < 43:
                    raise ValueError("token_entropy_insufficient")
                self.values[role] = token
            else:
                self.rotate(role)

    def rotate(self, role: str) -> str:
        if role not in {"consumer", "admin"}:
            raise ValueError("unknown role")
        token = secrets.token_urlsafe(32)
        write_private(self.directory / f"{role}_token", token)
        self.values[role] = token
        return token

    def role(self, header: str) -> str | None:
        candidate = header.removeprefix("Bearer ") if header.startswith("Bearer ") else ""
        role = None
        for key, token in self.values.items():
            if secrets.compare_digest(candidate.encode(), token.encode()):
                role = key
        return role


class RateLimiter:
    def __init__(self, clock: Clock, limit: int = 120, seconds: float = 60) -> None:
        self.clock, self.limit, self.seconds = clock, limit, seconds
        self.entries: OrderedDict[str, tuple[float, int]] = OrderedDict()

    def allow(self, key: str) -> bool:
        now = self.clock.monotonic()
        start, count = self.entries.get(key, (now, 0))
        if now - start >= self.seconds:
            start, count = now, 0
        self.entries[key] = (start, count + 1)
        self.entries.move_to_end(key)
        while len(self.entries) > 1024:
            self.entries.popitem(last=False)
        return count < self.limit
