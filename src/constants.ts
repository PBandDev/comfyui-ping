export const SETTINGS_PREFIX = "comfyui-ping";
export const LOGGING_PREFIX = `[${SETTINGS_PREFIX}]`;
export const SOUND_SOURCES = {
  BUNDLED: "bundled",
  CUSTOM: "custom",
} as const;
export const SETTINGS_IDS = {
  VERSION: `${SETTINGS_PREFIX}.Version`,
  DEBUG_LOGGING: `${SETTINGS_PREFIX}.Debug Logging`,
};
