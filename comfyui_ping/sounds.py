from collections.abc import Iterable
from pathlib import Path
from typing import Literal, TypedDict


REPO_ROOT = Path(__file__).resolve().parents[1]
SOUNDS_DIR = REPO_ROOT / "sounds"
BUNDLED_SOUNDS_DIR = SOUNDS_DIR / "bundled"
CUSTOM_SOUNDS_DIR = SOUNDS_DIR / "custom"
LEGACY_CUSTOM_SOUNDS_DIR = REPO_ROOT / "input" / "ping"
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".ogg", ".m4a", ".flac"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class SoundCatalogEntry(TypedDict):
    name: str
    source: Literal["bundled", "custom"]


def is_allowed_upload(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def list_available_sounds(
    *,
    bundled: Iterable[str],
    custom: Iterable[str],
) -> list[SoundCatalogEntry]:
    return [
        *(
            {"name": name, "source": "bundled"}
            for name in bundled
        ),
        *(
            {"name": name, "source": "custom"}
            for name in custom
        ),
    ]


def list_sound_files(directory: Path) -> list[str]:
    if not directory.exists():
        return []

    return sorted(
        file.name
        for file in directory.iterdir()
        if file.is_file() and is_allowed_upload(file.name)
    )


def list_bundled_sounds(bundled_dir: Path = BUNDLED_SOUNDS_DIR) -> list[str]:
    return list_sound_files(bundled_dir)


def list_custom_sounds(custom_dir: Path = CUSTOM_SOUNDS_DIR) -> list[str]:
    return list_sound_files(custom_dir)


def ensure_custom_sound_storage(
    custom_dir: Path = CUSTOM_SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_CUSTOM_SOUNDS_DIR,
    bundled_dir: Path = BUNDLED_SOUNDS_DIR,
) -> Path:
    custom_dir.mkdir(parents=True, exist_ok=True)
    if not legacy_custom_dir.exists():
        return custom_dir

    for legacy_file in legacy_custom_dir.iterdir():
        if not legacy_file.is_file() or not is_allowed_upload(legacy_file.name):
            continue

        if (bundled_dir / legacy_file.name).exists():
            legacy_file.unlink(missing_ok=True)
            continue

        target_path = custom_dir / legacy_file.name
        if target_path.exists():
            legacy_file.unlink(missing_ok=True)
            continue

        legacy_file.replace(target_path)

    return custom_dir
