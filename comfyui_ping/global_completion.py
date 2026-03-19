from collections.abc import Callable

from .notifications import (
    NotificationPayload,
    build_global_notification_payload,
)
from .runtime import RuntimeSettings, build_sound_settings, should_notify_status


def should_notify_global(
    notify_mode: str,
    queue_size_after_completion: int,
) -> bool:
    if notify_mode == "every_prompt":
        return True
    return queue_size_after_completion == 0


def build_global_completion_payload(
    status: str,
    global_settings: dict[str, str],
    *,
    volume: float = 0.8,
    source: str = "queue_drained",
) -> NotificationPayload:
    return build_global_notification_payload(
        status=status,
        global_settings=global_settings,
        volume=volume,
        source=source,
    )


def resolve_global_completion_payload(
    status: str,
    queue_size_after_completion: int,
    runtime_settings: RuntimeSettings,
) -> NotificationPayload | None:
    if not should_notify_global(
        runtime_settings["notify_mode"],
        queue_size_after_completion,
    ):
        return None

    if not should_notify_status(runtime_settings, status):
        return None

    return build_global_completion_payload(
        status=status,
        global_settings=build_sound_settings(runtime_settings),
        volume=runtime_settings["volume"],
        source=runtime_settings["notify_mode"],
    )


def install_global_completion_hooks(
    emit_notification: Callable[[NotificationPayload], None] | None = None,
    get_runtime_settings: Callable[[], RuntimeSettings] | None = None,
) -> bool:
    try:
        import execution
    except ImportError:
        return False

    prompt_queue_cls = getattr(execution, "PromptQueue", None)
    if prompt_queue_cls is None:
        return False

    hook_config = getattr(prompt_queue_cls, "_comfyui_ping_hook_config", None)
    if hook_config is None:
        hook_config = {
            "emit_notification": None,
            "get_runtime_settings": None,
        }
        setattr(prompt_queue_cls, "_comfyui_ping_hook_config", hook_config)

    if emit_notification is not None:
        hook_config["emit_notification"] = emit_notification
    if get_runtime_settings is not None:
        hook_config["get_runtime_settings"] = get_runtime_settings

    if getattr(prompt_queue_cls, "_comfyui_ping_hook_installed", False):
        return True

    original_task_done = prompt_queue_cls.task_done

    def wrapped_task_done(
        self,
        item_id,
        history_result,
        status,
        process_item=None,
        **kwargs,
    ):
        if process_item is None and not kwargs:
            result = original_task_done(self, item_id, history_result, status)
        else:
            result = original_task_done(
                self,
                item_id,
                history_result,
                status,
                process_item=process_item,
                **kwargs,
            )

        current_config = getattr(prompt_queue_cls, "_comfyui_ping_hook_config", {})
        current_emit_notification = current_config.get("emit_notification")
        current_get_runtime_settings = current_config.get("get_runtime_settings")

        if current_emit_notification is None or current_get_runtime_settings is None:
            return result

        payload = resolve_global_completion_payload(
            status=getattr(status, "status_str", "success"),
            queue_size_after_completion=len(getattr(self, "queue", [])),
            runtime_settings=current_get_runtime_settings(),
        )
        if payload is not None:
            current_emit_notification(payload)

        return result

    prompt_queue_cls.task_done = wrapped_task_done
    setattr(prompt_queue_cls, "_comfyui_ping_hook_installed", True)
    return True
