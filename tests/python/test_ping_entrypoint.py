import sys
import types
from asyncio import run
from contextlib import contextmanager
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
ENTRYPOINT_PATH = REPO_ROOT / "__init__.py"


@contextmanager
def comfy_api_stubbed():
    comfy_api_module = types.ModuleType("comfy_api")
    v002_module = types.ModuleType("comfy_api.v0_0_2")
    original_modules = {
        name: sys.modules.get(name)
        for name in (
            "comfy_api",
            "comfy_api.v0_0_2",
            "comfyui_ping.extension",
            "comfyui_ping.nodes",
        )
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


def load_module_from_path(module_name: str, module_path: Path):
    spec = spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None

    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_root_entrypoint_exports_v3_entrypoint_and_web_directory():
    module = load_module_from_path("ping_root_entrypoint", ENTRYPOINT_PATH)

    assert module.WEB_DIRECTORY == "./dist"
    assert callable(module.comfy_entrypoint)


def test_comfy_entrypoint_returns_ping_extension():
    with comfy_api_stubbed():
        from comfyui_ping.extension import PingExtension

        module = load_module_from_path("ping_root_entrypoint", ENTRYPOINT_PATH)
        extension = module.comfy_entrypoint()

        assert isinstance(extension, PingExtension)


def test_comfy_entrypoint_works_without_repo_root_on_sys_path():
    with comfy_api_stubbed():
        original_sys_path = list(sys.path)
        original_extension = sys.modules.pop("comfyui_ping.extension", None)
        original_package = sys.modules.pop("comfyui_ping", None)
        sys.path[:] = [path for path in sys.path if path != str(REPO_ROOT)]

        try:
            module = load_module_from_path(
                "ping_root_entrypoint_no_repo_path",
                ENTRYPOINT_PATH,
            )
            extension = module.comfy_entrypoint()
        finally:
            sys.path[:] = original_sys_path
            if original_package is not None:
                sys.modules["comfyui_ping"] = original_package
            if original_extension is not None:
                sys.modules["comfyui_ping.extension"] = original_extension

        assert extension is not None


def test_ping_extension_retries_sound_route_registration_on_get_node_list():
    with comfy_api_stubbed():
        import comfyui_ping.extension as extension_module

        register_attempts: list[int] = []

        def fake_install_global_completion_hooks(
            *,
            emit_notification,
            get_runtime_settings,
        ) -> bool:
            return True

        def fake_register_sound_routes() -> bool:
            register_attempts.append(len(register_attempts) + 1)
            return len(register_attempts) > 1

        original_install = extension_module.install_global_completion_hooks
        original_register = extension_module.register_sound_routes
        extension_module.install_global_completion_hooks = (
            fake_install_global_completion_hooks
        )
        extension_module.register_sound_routes = fake_register_sound_routes

        try:
            extension = extension_module.PingExtension()

            assert extension.sound_routes_registered is False

            run(extension.get_node_list())

            assert extension.sound_routes_registered is True
            assert register_attempts == [1, 2]
        finally:
            extension_module.install_global_completion_hooks = original_install
            extension_module.register_sound_routes = original_register


def test_ping_extension_retries_global_hook_installation_on_get_node_list():
    with comfy_api_stubbed():
        import comfyui_ping.extension as extension_module

        hook_attempts: list[int] = []

        def fake_install_global_completion_hooks(
            *,
            emit_notification,
            get_runtime_settings,
        ) -> bool:
            hook_attempts.append(len(hook_attempts) + 1)
            return len(hook_attempts) > 1

        original_install = extension_module.install_global_completion_hooks
        extension_module.install_global_completion_hooks = (
            fake_install_global_completion_hooks
        )

        try:
            extension = extension_module.PingExtension()

            assert extension.global_completion_hooks_installed is False

            run(extension.get_node_list())

            assert extension.global_completion_hooks_installed is True
            assert hook_attempts == [1, 2]
        finally:
            extension_module.install_global_completion_hooks = original_install
