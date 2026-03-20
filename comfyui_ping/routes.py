from pathlib import Path
from typing import Protocol

from .runtime import get_runtime_settings, update_runtime_settings
from .sounds import (
    LEGACY_INPUT_SOUNDS_DIR,
    MAX_UPLOAD_BYTES,
    SOUNDS_DIR,
    ensure_sound_storage,
    is_allowed_upload,
    list_available_sounds,
    list_sound_files,
)

SOUND_CATALOG_ROUTE = "/comfyui-ping/sounds"
SOUND_UPLOAD_ROUTE = "/comfyui-ping/sounds/upload"
SOUND_FILE_ROUTE = "/comfyui-ping/sounds/{filename}"
SETTINGS_ROUTE = "/comfyui-ping/settings"

_SOUND_ROUTES_REGISTERED = False


class RouteRegistrar(Protocol):
    def get(self, path: str): ...
    def post(self, path: str): ...


def build_sound_catalog_payload(
    sounds: list[str],
) -> dict[str, list[dict[str, str]]]:
    return {"sounds": list_available_sounds(sounds)}


def resolve_sound_path(
    *,
    filename: str,
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> Path | None:
    safe_name = Path(filename).name
    ensure_sound_storage(
        sounds_dir=sounds_dir,
        legacy_custom_dir=legacy_custom_dir,
    )
    candidate = sounds_dir / safe_name
    return candidate if candidate.is_file() else None


def save_uploaded_sound(
    *,
    filename: str,
    data: bytes,
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> Path:
    if not is_allowed_upload(filename):
        raise ValueError("Invalid audio file format")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("Sound file exceeds 10 MiB limit")

    safe_name = Path(filename).name
    ensure_sound_storage(
        sounds_dir=sounds_dir,
        legacy_custom_dir=legacy_custom_dir,
    )
    target_path = sounds_dir / safe_name
    if target_path.is_file():
        raise ValueError("Filename already exists")
    target_path.write_bytes(data)
    return target_path


def list_sounds_route_payload(
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> dict[str, list[dict[str, str]]]:
    ensure_sound_storage(
        sounds_dir=sounds_dir,
        legacy_custom_dir=legacy_custom_dir,
    )
    return build_sound_catalog_payload(list_sound_files(sounds_dir))


def runtime_settings_route_payload() -> dict[str, object]:
    return get_runtime_settings()


def serve_sound_route_path(
    filename: str,
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> Path | None:
    return resolve_sound_path(
        filename=filename,
        sounds_dir=sounds_dir,
        legacy_custom_dir=legacy_custom_dir,
    )


def attach_sound_routes(
    *,
    routes: RouteRegistrar,
    web_module: object,
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> None:
    @routes.get(SOUND_CATALOG_ROUTE)
    async def list_sounds(_request):
        return web_module.json_response(
            list_sounds_route_payload(
                sounds_dir=sounds_dir,
                legacy_custom_dir=legacy_custom_dir,
            )
        )

    @routes.get(SETTINGS_ROUTE)
    async def get_runtime_settings_route(_request):
        return web_module.json_response(runtime_settings_route_payload())

    @routes.post(SETTINGS_ROUTE)
    async def update_runtime_settings_route(request):
        payload = await request.json()
        if not isinstance(payload, dict):
            return web_module.json_response(
                {"error": "Invalid settings payload"},
                status=400,
            )

        return web_module.json_response(update_runtime_settings(payload))

    @routes.get(SOUND_FILE_ROUTE)
    async def serve_sound(request):
        path = serve_sound_route_path(
            filename=request.match_info.get("filename", ""),
            sounds_dir=sounds_dir,
            legacy_custom_dir=legacy_custom_dir,
        )
        if path is None:
            raise web_module.HTTPNotFound()

        return web_module.FileResponse(path)

    @routes.post(SOUND_UPLOAD_ROUTE)
    async def upload_sound(request):
        form_data = await request.post()
        upload = form_data.get("file")
        filename = getattr(upload, "filename", None)
        file_handle = getattr(upload, "file", None)
        if not isinstance(filename, str) or file_handle is None:
            return web_module.json_response(
                {"error": "Missing sound file"},
                status=400,
            )

        try:
            data = file_handle.read()
            if not isinstance(data, bytes):
                raise ValueError("Missing sound file")

            save_uploaded_sound(
                filename=filename,
                data=data,
                sounds_dir=sounds_dir,
                legacy_custom_dir=legacy_custom_dir,
            )
        except ValueError as exc:
            return web_module.json_response(
                {"error": str(exc)},
                status=400,
            )

        return web_module.json_response(
            list_sounds_route_payload(
                sounds_dir=sounds_dir,
                legacy_custom_dir=legacy_custom_dir,
            ),
            status=201,
        )


def register_sound_routes(
    *,
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> bool:
    global _SOUND_ROUTES_REGISTERED

    if _SOUND_ROUTES_REGISTERED:
        return True

    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return False

    prompt_server = getattr(PromptServer, "instance", None)
    routes = getattr(prompt_server, "routes", None)
    if routes is None:
        return False

    attach_sound_routes(
        routes=routes,
        web_module=web,
        sounds_dir=sounds_dir,
        legacy_custom_dir=legacy_custom_dir,
    )
    _SOUND_ROUTES_REGISTERED = True
    return True
