"""Physical addresses belong only to adapter configuration and transport."""

from typing import Literal, Self

from pydantic import model_validator

from ..model import Model


class AdapterConfig(Model):
    kind: Literal["ha_state", "ha_attribute", "mqtt", "scheduler"]
    ha_entity_id: str | None = None
    ha_attribute: str | None = None
    mqtt_topic: str | None = None
    mqtt_value_path: str | None = None
    mqtt_time_path: str | None = None

    @model_validator(mode="after")
    def address(self) -> Self:
        if self.kind.startswith("ha_") and not self.ha_entity_id:
            raise ValueError("entity required")
        if self.kind == "ha_attribute" and not self.ha_attribute:
            raise ValueError("attribute required")
        if self.kind == "mqtt" and not self.mqtt_topic:
            raise ValueError("topic required")
        return self
