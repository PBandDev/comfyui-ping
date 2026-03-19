import sys
from asyncio import run
from io import BytesIO
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from comfyui_ping.routes import (
    SOUND_CATALOG_ROUTE,
    SOUND_FILE_ROUTE,
    SOUND_UPLOAD_ROUTE,
    attach_sound_routes,
    build_sound_catalog_payload,
    resolve_sound_path,
    save_uploaded_sound,
)
from comfyui_ping.sounds import MAX_UPLOAD_BYTES


def test_build_sound_catalog_payload_returns_sound_list():
    payload = build_sound_catalog_payload(
        bundled=["ping-success.wav"],
        custom=["custom.wav"],
    )

    assert payload == {
        "sounds": [
            {"name": "ping-success.wav", "source": "bundled"},
            {"name": "custom.wav", "source": "custom"},
        ],
    }


def test_list_sounds_route_payload_returns_structured_catalog(tmp_path: Path):
    bundled_dir = tmp_path / "bundled"
    custom_dir = tmp_path / "custom"
    legacy_custom_dir = tmp_path / "legacy"
    bundled_dir.mkdir()
    custom_dir.mkdir()
    (bundled_dir / "ping-success.wav").write_bytes(b"bundled")
    (custom_dir / "custom.wav").write_bytes(b"custom")

    from comfyui_ping.routes import list_sounds_route_payload

    payload = list_sounds_route_payload(
        bundled_dir=bundled_dir,
        custom_dir=custom_dir,
        legacy_custom_dir=legacy_custom_dir,
    )

    assert payload == {
        "sounds": [
            {"name": "ping-success.wav", "source": "bundled"},
            {"name": "custom.wav", "source": "custom"},
        ],
    }


def test_resolve_sound_path_uses_requested_source():
    bundled_dir = REPO_ROOT / "sounds" / "bundled"
    custom_dir = REPO_ROOT / "sounds" / "custom"
    legacy_custom_dir = REPO_ROOT / "input" / "ping-unused-test"
    custom_dir.mkdir(parents=True, exist_ok=True)
    custom_file = custom_dir / "ping-success.wav"
    custom_file.write_bytes(b"custom")

    try:
        bundled_path = resolve_sound_path(
            filename="ping-success.wav",
            source="bundled",
            bundled_dir=bundled_dir,
            custom_dir=custom_dir,
            legacy_custom_dir=legacy_custom_dir,
        )
        custom_path = resolve_sound_path(
            filename="ping-success.wav",
            source="custom",
            bundled_dir=bundled_dir,
            custom_dir=custom_dir,
            legacy_custom_dir=legacy_custom_dir,
        )
    finally:
        custom_file.unlink(missing_ok=True)

    assert bundled_path == bundled_dir / "ping-success.wav"
    assert custom_path == custom_file


def test_list_sounds_route_payload_migrates_legacy_custom_uploads(tmp_path: Path):
    bundled_dir = tmp_path / "sounds" / "bundled"
    custom_dir = tmp_path / "sounds" / "custom"
    legacy_custom_dir = tmp_path / "input" / "ping"
    bundled_dir.mkdir(parents=True)
    legacy_custom_dir.mkdir(parents=True)
    (bundled_dir / "ping-success.wav").write_bytes(b"bundled")
    (legacy_custom_dir / "ringtone5.mp3").write_bytes(b"legacy")

    from comfyui_ping.routes import list_sounds_route_payload

    payload = list_sounds_route_payload(
        bundled_dir=bundled_dir,
        custom_dir=custom_dir,
        legacy_custom_dir=legacy_custom_dir,
    )

    assert payload == {
        "sounds": [
            {"name": "ping-success.wav", "source": "bundled"},
            {"name": "ringtone5.mp3", "source": "custom"},
        ],
    }
    assert (custom_dir / "ringtone5.mp3").read_bytes() == b"legacy"
    assert (legacy_custom_dir / "ringtone5.mp3").exists() is False


def test_list_sounds_route_payload_skips_legacy_files_promoted_to_bundled(
    tmp_path: Path,
):
    bundled_dir = tmp_path / "sounds" / "bundled"
    custom_dir = tmp_path / "sounds" / "custom"
    legacy_custom_dir = tmp_path / "input" / "ping"
    bundled_dir.mkdir(parents=True)
    legacy_custom_dir.mkdir(parents=True)
    (bundled_dir / "ping-ringtone.wav").write_bytes(b"bundled")
    (legacy_custom_dir / "ping-ringtone.wav").write_bytes(b"legacy")

    from comfyui_ping.routes import list_sounds_route_payload

    payload = list_sounds_route_payload(
        bundled_dir=bundled_dir,
        custom_dir=custom_dir,
        legacy_custom_dir=legacy_custom_dir,
    )

    assert payload == {
        "sounds": [{"name": "ping-ringtone.wav", "source": "bundled"}],
    }
    assert (custom_dir / "ping-ringtone.wav").exists() is False
    assert (legacy_custom_dir / "ping-ringtone.wav").exists() is False


def test_save_uploaded_sound_rejects_invalid_extension(tmp_path: Path):
    try:
        save_uploaded_sound(
            filename="not-a-sound.txt",
            data=b"bad",
            custom_dir=tmp_path,
            legacy_custom_dir=tmp_path / "legacy",
        )
    except ValueError as exc:
        assert str(exc) == "Invalid audio file format"
    else:
        raise AssertionError("save_uploaded_sound should reject invalid extensions")


def test_save_uploaded_sound_rejects_oversized_file(tmp_path: Path):
    try:
        save_uploaded_sound(
            filename="too-large.wav",
            data=b"0" * (MAX_UPLOAD_BYTES + 1),
            custom_dir=tmp_path / "custom",
            legacy_custom_dir=tmp_path / "legacy",
        )
    except ValueError as exc:
        assert str(exc) == "Sound file exceeds 10 MiB limit"
    else:
        raise AssertionError("save_uploaded_sound should reject oversized files")


def test_save_uploaded_sound_rejects_bundled_name_collision(tmp_path: Path):
    bundled_dir = tmp_path / "bundled"
    legacy_custom_dir = tmp_path / "legacy"
    bundled_dir.mkdir()
    (bundled_dir / "ping-success.wav").write_bytes(b"bundled")

    try:
        save_uploaded_sound(
            filename="ping-success.wav",
            data=b"custom",
            custom_dir=tmp_path / "custom",
            bundled_dir=bundled_dir,
            legacy_custom_dir=legacy_custom_dir,
        )
    except ValueError as exc:
        assert str(exc) == "Filename collides with bundled sound"
    else:
        raise AssertionError("save_uploaded_sound should reject bundled name collisions")


def test_save_uploaded_sound_rejects_existing_custom_filename(tmp_path: Path):
    custom_dir = tmp_path / "custom"
    legacy_custom_dir = tmp_path / "legacy"
    custom_dir.mkdir()
    (custom_dir / "custom.wav").write_bytes(b"old")

    try:
        save_uploaded_sound(
            filename="custom.wav",
            data=b"new",
            custom_dir=custom_dir,
            bundled_dir=tmp_path / "bundled",
            legacy_custom_dir=legacy_custom_dir,
        )
    except ValueError as exc:
        assert str(exc) == "Filename already exists in custom sounds"
    else:
        raise AssertionError("save_uploaded_sound should reject existing custom filenames")


def test_resolve_sound_path_rejects_non_files(tmp_path: Path):
    bundled_dir = tmp_path / "bundled"
    custom_dir = tmp_path / "custom"
    legacy_custom_dir = tmp_path / "legacy"
    (bundled_dir / "ping-success.wav").mkdir(parents=True)
    custom_dir.mkdir()

    path = resolve_sound_path(
        filename="ping-success.wav",
        source="bundled",
        bundled_dir=bundled_dir,
        custom_dir=custom_dir,
        legacy_custom_dir=legacy_custom_dir,
    )

    assert path is None


class FakeRoutes:
    def __init__(self) -> None:
        self.handlers: dict[tuple[str, str], object] = {}

    def get(self, path: str):
        def decorator(handler):
            self.handlers[("GET", path)] = handler
            return handler

        return decorator

    def post(self, path: str):
        def decorator(handler):
            self.handlers[("POST", path)] = handler
            return handler

        return decorator


class FakeWeb:
    class HTTPNotFound(Exception):
        pass

    class Response:
        def __init__(
            self,
            *,
            payload: object | None = None,
            path: Path | None = None,
            status: int = 200,
        ) -> None:
            self.payload = payload
            self.path = path
            self.status = status

    @staticmethod
    def json_response(payload: object, status: int = 200) -> "FakeWeb.Response":
        return FakeWeb.Response(payload=payload, status=status)

    @staticmethod
    def FileResponse(path: Path) -> "FakeWeb.Response":
        return FakeWeb.Response(path=path, status=200)


class FakeUploadField:
    def __init__(self, *, filename: str, data: bytes) -> None:
        self.filename = filename
        self.file = BytesIO(data)


class FakeRequest:
    def __init__(
        self,
        *,
        post_data: dict[str, object] | None = None,
        match_info: dict[str, str] | None = None,
    ) -> None:
        self._post_data = post_data or {}
        self.match_info = match_info or {}

    async def post(self) -> dict[str, object]:
        return self._post_data


def test_attach_sound_routes_registers_live_handlers(tmp_path: Path):
    routes = FakeRoutes()
    bundled_dir = tmp_path / "bundled"
    custom_dir = tmp_path / "custom"
    legacy_custom_dir = tmp_path / "legacy"
    bundled_dir.mkdir()
    custom_dir.mkdir()
    (bundled_dir / "ping-success.wav").write_bytes(b"bundled")

    attach_sound_routes(
        routes=routes,
        web_module=FakeWeb,
        bundled_dir=bundled_dir,
        custom_dir=custom_dir,
        legacy_custom_dir=legacy_custom_dir,
    )

    assert ("GET", SOUND_CATALOG_ROUTE) in routes.handlers
    assert ("GET", SOUND_FILE_ROUTE) in routes.handlers
    assert ("POST", SOUND_UPLOAD_ROUTE) in routes.handlers

    list_handler = routes.handlers[("GET", SOUND_CATALOG_ROUTE)]
    list_response = run(list_handler(FakeRequest()))
    assert list_response.payload == {
        "sounds": [{"name": "ping-success.wav", "source": "bundled"}]
    }

    upload_handler = routes.handlers[("POST", SOUND_UPLOAD_ROUTE)]
    upload_response = run(
        upload_handler(
            FakeRequest(
                post_data={
                    "file": FakeUploadField(
                        filename="custom.wav",
                        data=b"custom",
                    )
                }
            )
        )
    )
    assert upload_response.status == 201
    assert upload_response.payload == {
        "sounds": [
            {"name": "ping-success.wav", "source": "bundled"},
            {"name": "custom.wav", "source": "custom"},
        ]
    }

    serve_handler = routes.handlers[("GET", SOUND_FILE_ROUTE)]
    serve_response = run(
        serve_handler(
            FakeRequest(
                match_info={
                    "source": "custom",
                    "filename": "custom.wav",
                }
            )
        )
    )
    assert serve_response.path == custom_dir / "custom.wav"
