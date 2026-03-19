from comfy_api.v0_0_2 import io

from .notifications import build_notification_payload
from .runtime import emit_notification


class PingNode(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PingNode",
            display_name="Ping",
            category="comfyui-ping",
            description="Build a notification payload for the current workflow run.",
            is_output_node=True,
            inputs=[
                io.String.Input("success_sound"),
                io.String.Input("failure_sound"),
                io.Float.Input("volume", min=0.0, max=1.0, step=0.05),
                io.Boolean.Input("enabled"),
            ],
            outputs=[io.AnyType.Output("notification")],
        )

    @classmethod
    def execute(
        cls,
        success_sound: str,
        failure_sound: str,
        volume: float,
        enabled: bool,
    ) -> io.NodeOutput:
        payload = build_notification_payload(
            event_kind="node",
            status="success",
            global_settings={
                "success_sound": success_sound,
                "failure_sound": failure_sound,
            },
            node_overrides=None,
            volume=volume,
        )

        if enabled:
            emit_notification(payload)

        return io.NodeOutput(payload)
