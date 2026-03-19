import sys
from pathlib import Path


WEB_DIRECTORY = "./dist"
NODE_CLASS_MAPPINGS = None
NODE_DISPLAY_NAME_MAPPINGS = None

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
    "comfy_entrypoint",
]


def comfy_entrypoint():
    repo_root = Path(__file__).resolve().parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    from comfyui_ping.extension import comfy_entrypoint as _comfy_entrypoint

    return _comfy_entrypoint()
