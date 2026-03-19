from comfy_api.v0_0_2 import ComfyExtension

from .global_completion import install_global_completion_hooks
from .nodes import PingNode
from .routes import register_sound_routes
from .runtime import emit_notification, get_runtime_settings


class PingExtension(ComfyExtension):
    def __init__(self) -> None:
        self.global_completion_hooks_installed = install_global_completion_hooks(
            emit_notification=emit_notification,
            get_runtime_settings=get_runtime_settings,
        )
        self.sound_routes_registered = register_sound_routes()

    async def get_node_list(self) -> list[type[PingNode]]:
        if not self.global_completion_hooks_installed:
            self.global_completion_hooks_installed = install_global_completion_hooks(
                emit_notification=emit_notification,
                get_runtime_settings=get_runtime_settings,
            )
        if not self.sound_routes_registered:
            self.sound_routes_registered = register_sound_routes()
        return [PingNode]


def comfy_entrypoint() -> ComfyExtension:
    return PingExtension()
