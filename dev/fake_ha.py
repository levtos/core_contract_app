"""Deterministic HA bridge protocol fixture; contains no contract producer."""

from aiohttp import web


class FakeHA:
    def __init__(self, states=None, protocol=1, missing=False):
        self.states = states or {}
        self.protocol, self.missing = protocol, missing
        self.requests = []
        self.sockets = set()

    def application(self):
        app = web.Application()
        app.router.add_get("/websocket", self.socket)
        return app

    async def socket(self, request):
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        self.sockets.add(socket)
        await socket.send_json({"type": "auth_required"})
        await socket.receive_json()
        await socket.send_json({"type": "auth_ok"})
        try:
            async for message in socket:
                if message.type != web.WSMsgType.TEXT:
                    break
                data = message.json()
                self.requests.append(data)
                kind = data["type"]
                result = {}
                if kind == "core_contracts_bridge/info":
                    if self.missing:
                        await socket.send_json(
                            {
                                "id": data["id"],
                                "type": "result",
                                "success": False,
                                "error": {"code": "unknown_command"},
                            }
                        )
                        continue
                    result = {
                        "protocol_version": self.protocol,
                        "bridge_version": "test",
                        "ha_version": "test",
                        "ha_state": "running",
                    }
                await socket.send_json(
                    {"id": data["id"], "type": "result", "success": True, "result": result}
                )
                if kind == "core_contracts_bridge/subscribe":
                    await socket.send_json(
                        {
                            "id": data["id"],
                            "type": "event",
                            "event": {
                                "kind": "snapshot",
                                "states": {key: self.states.get(key) for key in data["entity_ids"]},
                            },
                        }
                    )
        finally:
            self.sockets.discard(socket)
        return socket

    async def emit(self, event):
        for socket in self.sockets:
            await socket.send_json({"id": 5, "type": "event", "event": event})
