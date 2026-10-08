"""One instance, no credentials or semantic configuration."""

from homeassistant import config_entries


class BridgeFlow(config_entries.ConfigFlow, domain="core_contracts_bridge"):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Core Contracts Bridge", data={})
        return self.async_show_form(step_id="user")
