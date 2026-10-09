"""Two listeners with independent ingress and bearer trust boundaries."""

import asyncio
import secrets
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

import aiohttp
import asyncpg
from aiohttp import WSMsgType, web
from pydantic import ValidationError

from . import __version__
from .model import canonical
from .runtime import Runtime
from .security import RateLimiter, Tokens
from .setup import Setup


class API:
    def __init__(
        self,
        runtime: Runtime,
        tokens: Tokens,
        installation_id: str,
        *,
        installation_label: str = "",
        ingress_address: str = "172.30.32.2",
        frontend: Path | None = None,
        setup: Setup | None = None,
    ) -> None:
        self.runtime, self.tokens, self.installation_id = runtime, tokens, installation_id
        self.installation_label, self.ingress_address, self.frontend = (
            installation_label,
            ingress_address,
            frontend,
        )
        self.limiter = RateLimiter(runtime.clock)
        self.setup = setup
        self.auth_limiter = RateLimiter(runtime.clock)
        self.sockets: set[web.WebSocketResponse] = set()

    def application(self, *, ingress: bool = False) -> web.Application:
        @web.middleware
        async def boundary(
            request: web.Request, handler: Callable[[web.Request], Awaitable[web.StreamResponse]]
        ) -> web.StreamResponse:
            if ingress:
                if request.remote != self.ingress_address:
                    raise web.HTTPForbidden()
                role = "admin"
            elif request.path.startswith("/health/"):
                role = "health"
            else:
                if not self.auth_limiter.allow(f"auth:{request.remote}"):
                    raise web.HTTPTooManyRequests()
                role = self.tokens.role(request.headers.get("Authorization", "")) or ""
                if not role:
                    raise web.HTTPUnauthorized()
            if role != "health" and not self.limiter.allow(f"{request.remote}:{role}"):
                raise web.HTTPTooManyRequests()
            request["role"] = role
            setup_path = request.path.startswith("/api/v1/setup/")
            static_path = ingress and not request.path.startswith(("/api/", "/health/"))
            if setup_path and (not ingress or self.setup is None):
                raise web.HTTPNotFound()
            if setup_path and request.method != "GET":
                if (
                    request.content_type != "application/json"
                    or request.headers.get("Sec-Fetch-Site") == "cross-site"
                    or not secrets.compare_digest(
                        request.headers.get("X-Setup-CSRF", ""),
                        self.setup.csrf if self.setup else "",
                    )
                ):
                    raise web.HTTPForbidden()
            if not self.installation_id and role != "health" and not (setup_path or static_path):
                raise web.HTTPServiceUnavailable()
            if request.method not in {"GET", "HEAD"} and request.path != "/api/v1/commands":
                if role != "admin":
                    raise web.HTTPForbidden()
                # Ingress does not expose bearer credentials to JS; reject cross-origin writes.
                if ingress and request.headers.get("Sec-Fetch-Site") == "cross-site":
                    raise web.HTTPForbidden()
            try:
                response = await handler(request)
            except (KeyError, ValueError, ValidationError) as error:
                # Do not reflect input, DSNs, credentials, or Pydantic's input_value.
                code = (
                    str(error)
                    if type(error) is ValueError
                    and str(error)
                    in {
                        "active_revision_conflict",
                        "draft_version_conflict",
                        "cycle",
                        "contract_disabled",
                        "config_incomplete: type or parameters",
                        "config_incomplete: inputs",
                        "duplicate identity / producer",
                        "duplicate adapter evidence path",
                        "duplicate physical evidence path",
                        "unknown reference",
                        "unknown catalog",
                        "unknown liveness source",
                        "unbound source",
                        "disabled required dependency",
                        "revision_not_found",
                    }
                    else "invalid_request"
                )
                response = web.json_response(
                    {
                        "error": code,
                        "details": [
                            {"location": list(item["loc"]), "type": item["type"]}
                            for item in error.errors(
                                include_input=False, include_context=False, include_url=False
                            )
                        ]
                        if isinstance(error, ValidationError)
                        else [],
                    },
                    status=409 if "conflict" in code else 400,
                )
            except RuntimeError, OSError, asyncpg.PostgresError, asyncpg.InterfaceError:
                response = web.json_response({"error": "persistence_unavailable"}, status=503)
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"
            )
            return response

        app = web.Application(middlewares=[boundary], client_max_size=2_000_000)
        app.on_shutdown.append(self.close_sockets)
        app.router.add_get("/health/live", self.health)
        app.router.add_get("/health/ready", self.health)
        app.router.add_get("/api/v1/ws", self.websocket)
        if ingress and self.setup:
            app.router.add_route("*", "/api/v1/setup/{operation}", self.setup_dispatch)
        app.router.add_route("*", "/api/v1/{path:.*}", self.dispatch)
        if ingress:
            app.router.add_get("/{path:.*}", self.static)
        return app

    async def setup_dispatch(self, request: web.Request) -> web.Response:
        assert self.setup is not None
        try:
            result = await self.setup.dispatch(
                request.match_info["operation"],
                request.method,
                await request.json() if request.method != "GET" else None,
            )
            return web.json_response(result)
        except aiohttp.ClientError:
            return web.json_response({"error": "ha_connection_failed"}, status=503)
        except asyncpg.PostgresError, asyncpg.InterfaceError, OSError, TimeoutError:
            return web.json_response({"error": "database_connection_failed"}, status=503)
        except (ValueError, RuntimeError) as error:
            safe = {
                "confirmation_required",
                "insecure_tls_confirmation_required",
                "initialize_empty_database_required",
                "adopt_installation_id_required",
                "installation_mismatch",
                "foreign_database",
                "application_role_too_privileged",
                "postgres_version_unsupported",
                "provision_request_mismatch",
                "provision_request_missing",
                "ha_unavailable",
                "bridge_not_discovered",
                "bridge_flow_changed",
                "bridge_configuration_failed",
            }
            return web.json_response(
                {
                    "error": str(error)
                    if type(error) is ValueError and str(error) in safe
                    else "invalid_setup_request"
                },
                status=400,
            )

    async def close_sockets(self, app: web.Application) -> None:
        async def close(socket: web.WebSocketResponse) -> None:
            try:
                async with asyncio.timeout(2):
                    await socket.send_json({"type": "going_away"})
                    await socket.close(code=1001, message=b"shutdown")
            except TimeoutError, ConnectionError:
                pass

        await asyncio.gather(*(close(socket) for socket in list(self.sockets)))

    async def health(self, request: web.Request) -> web.Response:
        runtime = self.runtime
        if request.path.endswith("live"):
            return web.json_response({"live": runtime.live}, status=200 if runtime.live else 503)
        reasons = []
        if not runtime.persistence:
            reasons.append("persistence_unavailable")
        if runtime.state.active_revision == 0:
            reasons.append("no_active_registry")
        if not runtime.first_snapshot:
            reasons.append("first_bridge_snapshot_pending")
        return web.json_response(
            {**runtime.service_state(), "reasons": reasons}, status=200 if runtime.ready else 503
        )

    def info(self) -> dict[str, Any]:
        return {
            "version": __version__,
            "api_protocol": 1,
            "bridge_protocol": 1,
            "config_schema_version": 1,
            "installation_id": self.installation_id,
            "installation_label": self.installation_label,
            "epoch_id": self.runtime.state.epoch_id,
            "publication_seq": self.runtime.state.publication_seq,
        }

    async def dispatch(self, request: web.Request) -> web.Response:
        path, method = request.match_info["path"], request.method
        runtime, state, config = self.runtime, self.runtime.state, self.runtime.config
        public = path in {
            "info",
            "types",
            "contracts",
            "snapshot",
            "diagnostics/problems",
            "commands",
        } or path.startswith(("contracts/", "commands/"))
        if not public and request["role"] != "admin":
            raise web.HTTPForbidden()
        result: Any
        if path == "info" and method == "GET":
            result = self.info()
        elif path == "types" and method == "GET":
            result = [t.description() for t in runtime.types.types.values()]
        elif path == "contracts" and method == "GET":
            result = runtime.snapshot()["contracts"]
        elif path.startswith("contracts/") and method == "GET":
            key = path.removeprefix("contracts/")
            if config and any(c.contract_id == key and not c.enabled for c in config.contracts):
                return web.json_response({"error": "contract_disabled"}, status=409)
            result = state.tables["contract_state_current"].get(key)
            if result is None:
                raise web.HTTPNotFound()
        elif path == "snapshot" and method == "GET":
            selected = (
                request.query["contracts"].split(",") if "contracts" in request.query else None
            )
            result = runtime.snapshot(selected)
        elif path == "commands" and method == "POST":
            result = await runtime.submit("command", await request.json())
        elif path.startswith("commands/") and method == "GET":
            result = await runtime.store.get("command_log", path.removeprefix("commands/"))
            if result is None:
                raise web.HTTPNotFound()
            result = result["result"]
        elif path == "diagnostics/problems" and method == "GET":
            result = {
                "service": runtime.service_state(),
                "problems": [
                    {"contract_id": k, "field": f, "status": v["status"], "reasons": v["reasons"]}
                    for k, c in state.tables["contract_state_current"].items()
                    for f, v in c["fields"].items()
                    if v["status"] in {"unknown", "unresolved"}
                ],
            }
        elif path == "diagnostics" and method == "GET":
            result = {
                **self.info(),
                "service": runtime.service_state(),
                "queue_size": runtime.queue.qsize(),
                "commit_duration_s": runtime.commit_duration,
                "gaps": await runtime.store.rows("history_gap"),
                "dependencies": [d.model_dump() for d in config.dependencies] if config else [],
            }
        elif path in {"sources", "bindings"} and method == "GET":
            result = [v.model_dump(mode="json") for v in getattr(config, path)] if config else []
        elif path.startswith("evidence/") and method == "GET":
            source_id = path.removeprefix("evidence/")
            result = [
                v
                for v in state.tables["source_observation_current"].values()
                if v["source_id"] == source_id
            ]
        elif path.startswith("history/") and method == "GET":
            key = path.removeprefix("history/")
            result = await runtime.store.rows("contract_state_history", contract_id=key)
        elif path in {"registry/active", "registry/active/export"} and method == "GET":
            result = (
                config.model_dump(mode="json")
                if path.endswith("export") and config
                else state.tables["registry_revision"].get(str(state.active_revision))
            )
        elif path == "registry/revisions" and method == "GET":
            result = await runtime.store.rows("registry_revision")
        elif path.startswith("registry/revisions/") and method == "GET":
            result = await runtime.store.get("registry_revision", path.split("/")[-1])
        elif path == "registry/drafts" and method == "GET":
            result = list(state.tables["registry_draft"].values())
        elif path == "registry/drafts" and method == "POST":
            result = await runtime.submit("draft_create", {"config": await request.json()})
        elif path.startswith("registry/drafts/"):
            parts = path.split("/")
            key = parts[2]
            if len(parts) == 3 and method == "GET":
                result = state.tables["registry_draft"][key]
            elif len(parts) == 3 and method == "PUT":
                result = await runtime.submit(
                    "draft_update", {**await request.json(), "draft_id": key}
                )
            elif len(parts) == 4 and parts[3] == "validate" and method == "POST":
                result = await runtime.submit(
                    "validate", state.tables["registry_draft"][key]["config"]
                )
            elif len(parts) == 4 and parts[3] == "activate" and method == "POST":
                result = await runtime.submit("activate", {**await request.json(), "draft_id": key})
            else:
                raise web.HTTPMethodNotAllowed(method, ["GET", "PUT", "POST"])
        elif path == "registry/rollback" and method == "POST":
            result = await runtime.submit("rollback", await request.json())
        elif path == "tokens" and method == "GET":
            result = {"roles": ["consumer", "admin"], "tokens_visible": False}
        elif path == "tokens/rotate" and method == "POST":
            role = (await request.json())["role"]
            result = {"role": role, "token": self.tokens.rotate(role)}
        else:
            raise web.HTTPNotFound()
        return web.Response(text=canonical(result), content_type="application/json")

    async def websocket(self, request: web.Request) -> web.WebSocketResponse:
        socket = web.WebSocketResponse(max_msg_size=64_000, heartbeat=30)
        await socket.prepare(request)
        self.sockets.add(socket)
        queue = None
        sender = None
        selected: list[str] | None = None

        async def send_events() -> None:
            assert queue is not None
            while True:
                event = await queue.get()
                if event["type"] == "delta" and selected is not None:
                    event = {
                        **event,
                        "contracts": {k: v for k, v in event["contracts"].items() if k in selected},
                    }
                await socket.send_json(event)
                if event["type"] == "going_away":
                    await socket.close(code=1001)
                    return

        try:
            hello = await socket.receive_json(timeout=10)
            if hello.get("type") != "hello" or hello.get("protocol_version") != 1:
                await socket.close(code=1002)
                return socket
            if hello.get("expected_installation_id", self.installation_id) != self.installation_id:
                await socket.send_json({"type": "installation_mismatch"})
                await socket.close(code=1008)
                return socket
            await socket.send_json({"type": "welcome", **self.info(), "protocol_version": 1})
            await socket.send_json(self.runtime.service_state())
            async for message in socket:
                if message.type != WSMsgType.TEXT:
                    break
                data = message.json()
                if data.get("type") == "ping":
                    await socket.send_json({"type": "pong"})
                elif data.get("type") == "subscribe":
                    selected = data.get("contracts")
                    if selected is not None and (
                        not isinstance(selected, list)
                        or not all(isinstance(k, str) for k in selected)
                    ):
                        await socket.close(code=1002)
                        break
                    if sender:
                        sender.cancel()
                        await asyncio.gather(sender, return_exceptions=True)
                    if queue:
                        self.runtime.subscribers.discard(queue)
                    queue = self.runtime.subscribe()
                    # No await between queue registration and snapshot capture.
                    snapshot = self.runtime.snapshot(selected)
                    await socket.send_json({**snapshot, "id": data.get("id")})
                    sender = asyncio.create_task(send_events())
        except ValueError, TimeoutError:
            await socket.close(code=1002)
        finally:
            self.sockets.discard(socket)
            if queue:
                self.runtime.subscribers.discard(queue)
            if sender:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
        return socket

    async def static(self, request: web.Request) -> web.StreamResponse:
        if self.frontend is None:
            raise web.HTTPNotFound()
        root = self.frontend.resolve()
        target = (root / (request.match_info["path"] or "index.html")).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(target)
