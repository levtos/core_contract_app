"""Admin-only transport. No quality, normalization, retention or domain state."""

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import __version__ as HA_VERSION
from homeassistant.core import callback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_state_report_event,
)

DOMAIN = "core_contracts_bridge"
VERSION = "1.0.0a1"


async def async_setup_entry(hass, entry):
    active = set()
    hass.data[DOMAIN] = active

    @callback
    def unload():
        hass.data.pop(DOMAIN, None)
        for disconnect in tuple(active):
            disconnect()

    entry.async_on_unload(unload)

    @callback
    @websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/info"})
    @websocket_api.require_admin
    def info(hass, connection, msg):
        if DOMAIN not in hass.data:
            connection.send_error(msg["id"], "bridge_unloaded", "Bridge is not loaded")
            return
        connection.send_result(
            msg["id"],
            {
                "bridge_version": VERSION,
                "protocol_version": 1,
                "ha_version": HA_VERSION,
                "ha_state": str(hass.state),
            },
        )

    @callback
    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/subscribe",
            vol.Required("protocol_version"): int,
            vol.Required("entity_ids"): [str],
            vol.Optional("report_entity_ids"): [str],
        }
    )
    @websocket_api.require_admin
    def subscribe(hass, connection, msg):
        if DOMAIN not in hass.data:
            connection.send_error(msg["id"], "bridge_unloaded", "Bridge is not loaded")
            return
        if msg["protocol_version"] != 1:
            connection.send_error(msg["id"], "unsupported_protocol", "Bridge protocol 1 required")
            return
        entities = tuple(dict.fromkeys(msg["entity_ids"]))
        reports = tuple(
            entity for entity in msg.get("report_entity_ids", entities) if entity in entities
        )

        @callback
        def changed(event):
            old, new = event.data.get("old_state"), event.data.get("new_state")
            connection.send_event(
                msg["id"],
                {
                    "kind": "changed",
                    "entity_id": event.data["entity_id"],
                    "old_state": old.as_dict() if old else None,
                    "new_state": new.as_dict() if new else None,
                    "time_fired": event.time_fired.isoformat(),
                    "context": event.context.as_dict(),
                },
            )

        @callback
        def reported(event):
            connection.send_event(
                msg["id"],
                {
                    "kind": "reported",
                    "entity_id": event.data["entity_id"],
                    "last_reported": event.data["last_reported"].isoformat(),
                    "old_last_reported": event.data["old_last_reported"].isoformat(),
                    "time_fired": event.time_fired.isoformat(),
                    "context_id": event.context.id,
                },
            )

        # Both filtered listeners and the snapshot are installed in this callback without await.
        remove_change = async_track_state_change_event(hass, entities, changed)
        remove_report = (
            async_track_state_report_event(hass, reports, reported) if reports else lambda: None
        )
        removed = False

        @callback
        def unsubscribe():
            nonlocal removed
            if not removed:
                removed = True
                remove_change()
                remove_report()
                active.discard(reload_disconnect)

        @callback
        def reload_disconnect():
            unsubscribe()
            connection.send_event(msg["id"], {"kind": "bridge_reloaded"})

        connection.subscriptions[msg["id"]] = unsubscribe
        active.add(reload_disconnect)
        connection.send_result(msg["id"])
        connection.send_event(
            msg["id"],
            {
                "kind": "snapshot",
                "states": {
                    entity: state.as_dict() if (state := hass.states.get(entity)) else None
                    for entity in entities
                },
            },
        )

    websocket_api.async_register_command(hass, info)
    websocket_api.async_register_command(hass, subscribe)
    return True


async def async_unload_entry(hass, entry):
    return True
