from dataclasses import asdict
from typing import TypedDict

from .notifications import NotificationPayload, PING_EVENT_NAME, normalize_status


class RuntimeSettings(TypedDict):
    enabled: bool
    notify_mode: str
    success_enabled: bool
    failure_enabled: bool
    success_sound: str
    failure_sound: str
    volume: float


DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
    "enabled": True,
    "notify_mode": "queue_drained",
    "success_enabled": True,
    "failure_enabled": True,
    "success_sound": "bundled:ping-success.wav",
    "failure_sound": "bundled:ping-failure.wav",
    "volume": 0.8,
}

_runtime_settings: RuntimeSettings = dict(DEFAULT_RUNTIME_SETTINGS)


def get_runtime_settings() -> RuntimeSettings:
    return dict(_runtime_settings)


def update_runtime_settings(settings: dict[str, object]) -> RuntimeSettings:
    updated_settings = get_runtime_settings()

    for key in ("enabled", "success_enabled", "failure_enabled"):
        value = settings.get(key)
        if isinstance(value, bool):
            updated_settings[key] = value

    notify_mode = settings.get("notify_mode")
    if notify_mode in {"every_prompt", "queue_drained"}:
        updated_settings["notify_mode"] = notify_mode

    for key in ("success_sound", "failure_sound"):
        value = settings.get(key)
        if isinstance(value, str) and value:
            updated_settings[key] = value

    volume = settings.get("volume")
    if isinstance(volume, (int, float)):
        updated_settings["volume"] = max(0.0, min(float(volume), 1.0))

    _runtime_settings.update(updated_settings)
    return get_runtime_settings()


def build_sound_settings(settings: RuntimeSettings) -> dict[str, str]:
    return {
        "success_sound": settings["success_sound"],
        "failure_sound": settings["failure_sound"],
    }


def should_notify_status(settings: RuntimeSettings, status: str) -> bool:
    if not settings["enabled"]:
        return False

    normalized_status = normalize_status(status)
    if normalized_status == "success":
        return settings["success_enabled"]
    return settings["failure_enabled"]


def emit_notification(payload: NotificationPayload) -> bool:
    try:
        from server import PromptServer
    except ImportError:
        return False

    prompt_server = getattr(PromptServer, "instance", None)
    if prompt_server is None:
        return False

    prompt_server.send_sync(PING_EVENT_NAME, asdict(payload))
    return True
