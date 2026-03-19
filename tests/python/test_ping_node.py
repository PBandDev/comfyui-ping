import sys
import types
from contextlib import contextmanager
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


@contextmanager
def comfy_api_stubbed():
    comfy_api_module = types.ModuleType("comfy_api")
    v002_module = types.ModuleType("comfy_api.v0_0_2")
    original_modules = {
        name: sys.modules.get(name)
        for name in ("comfy_api", "comfy_api.v0_0_2", "comfyui_ping.nodes")
    }

    class ComfyExtension:
        async def get_node_list(self):
            return []

    class _Input:
        def __init__(self, name: str, **kwargs):
            self.name = name
            self.kwargs = kwargs

    class _Output:
        def __init__(self, name: str, **kwargs):
            self.name = name
            self.kwargs = kwargs

    class _String:
        Input = _Input

    class _Float:
        Input = _Input

    class _Boolean:
        Input = _Input

    class _AnyType:
        Output = _Output

    class Schema:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class NodeOutput:
        def __init__(self, *result, **kwargs):
            self.result = result
            self.kwargs = kwargs

    class ComfyNode:
        pass

    io = types.SimpleNamespace(
        Boolean=_Boolean,
        ComfyNode=ComfyNode,
        Float=_Float,
        NodeOutput=NodeOutput,
        Schema=Schema,
        String=_String,
        AnyType=_AnyType,
    )

    v002_module.ComfyExtension = ComfyExtension
    v002_module.io = io
    comfy_api_module.v0_0_2 = v002_module

    sys.modules["comfy_api"] = comfy_api_module
    sys.modules["comfy_api.v0_0_2"] = v002_module

    try:
        yield
    finally:
        for name, module in original_modules.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module


def test_ping_node_schema_exposes_override_inputs():
    with comfy_api_stubbed():
        from comfyui_ping.nodes import PingNode

        schema = PingNode.define_schema()
        input_names = [input_def.name for input_def in schema.inputs]

        assert "success_sound" in input_names
        assert "failure_sound" in input_names
        assert "volume" in input_names
        assert "enabled" in input_names


def test_ping_node_execute_emits_notification_payload():
    with comfy_api_stubbed():
        from comfyui_ping.nodes import PingNode

        output = PingNode.execute(
            success_sound="ding.wav",
            failure_sound="buzz.wav",
            volume=0.8,
            enabled=True,
        )

        assert output is not None


def test_ping_node_execute_emits_runtime_notification_when_enabled():
    with comfy_api_stubbed():
        import comfyui_ping.nodes as nodes_module

        emitted_payloads = []
        original_emit_notification = nodes_module.emit_notification
        nodes_module.emit_notification = emitted_payloads.append

        try:
            output = nodes_module.PingNode.execute(
                success_sound="ding.wav",
                failure_sound="buzz.wav",
                volume=0.35,
                enabled=True,
            )
        finally:
            nodes_module.emit_notification = original_emit_notification

        assert output is not None
        assert len(emitted_payloads) == 1
        assert emitted_payloads[0].status == "success"
        assert emitted_payloads[0].sound_id == "bundled:ding.wav"
        assert emitted_payloads[0].volume == 0.35
