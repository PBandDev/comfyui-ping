from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import json


REPO_ROOT = Path(__file__).resolve().parents[2]
ENTRYPOINT_PATH = REPO_ROOT / "__init__.py"
PACKAGE_JSON_PATH = REPO_ROOT / "package.json"
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"


def load_module_from_path(module_name: str, module_path: Path):
    spec = spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None

    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_template_entrypoint_exports_expected_symbols():
    module = load_module_from_path("template_entrypoint", ENTRYPOINT_PATH)

    assert module.WEB_DIRECTORY == "./dist"
    assert module.NODE_CLASS_MAPPINGS is None
    assert module.NODE_DISPLAY_NAME_MAPPINGS is None
    assert module.__all__ == [
        "NODE_CLASS_MAPPINGS",
        "NODE_DISPLAY_NAME_MAPPINGS",
        "WEB_DIRECTORY",
        "comfy_entrypoint",
    ]


def test_project_metadata_replaces_template_defaults():
    package_json = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    pyproject_text = PYPROJECT_PATH.read_text(encoding="utf-8")

    assert package_json["name"] == "comfyui-ping"
    assert package_json["description"] == (
        "Browser-played workflow success and failure audio notifications for ComfyUI"
    )
    assert 'name = "comfyui-ping"' in pyproject_text
    assert (
        'description = "Browser-played workflow success and failure audio notifications for ComfyUI"'
        in pyproject_text
    )
    assert 'PublisherId = "pbanddev"' in pyproject_text
    assert 'DisplayName = "comfyui-ping"' in pyproject_text
