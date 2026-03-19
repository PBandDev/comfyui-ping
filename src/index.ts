import type { ComfyApp } from "@comfyorg/comfyui-frontend-types";
import {
  handleNotificationEvent,
  type ManagedAudio,
  type NotificationEventDetail,
} from "./audio";
import {
  fetchSoundCatalog,
  storeRuntimeSettings,
  toSoundOptionId,
  uploadSoundFile,
  type FetchApiClient,
  type RuntimeNotificationSettings,
  type SoundCatalogPayload,
  type SoundOptionId,
} from "./api";
import { SETTINGS_IDS, SETTINGS_PREFIX } from "./constants";

declare global {
  const app: ComfyApp;

  interface Window {
    app: ComfyApp;
  }
}

type PingNotifyMode = "every_prompt" | "queue_drained";
type PingSettingValue = string | number | boolean | undefined;
type PingSettingRenderer = (
  name: string,
  setter: (value: unknown) => void,
  value: unknown,
  attrs?: Record<string, unknown>
) => HTMLElement;
type PingSettingType =
  | "boolean"
  | "slider"
  | "combo"
  | PingSettingRenderer;

interface PingSettingOption {
  text: string;
  value: string;
}

interface PingSetting {
  id: string;
  name: string;
  type: PingSettingType;
  defaultValue: PingSettingValue;
  onChange?: (newValue: unknown, oldValue?: unknown) => void;
  tooltip?: string;
  attrs?: Record<string, number>;
  options?: PingSettingOption[];
}

interface PingAppApi extends FetchApiClient {
  addEventListener: (
    eventName: string,
    listener: (event: { detail: NotificationEventDetail }) => void
  ) => void;
}

interface PingAppLike {
  api?: PingAppApi;
  registerExtension?: (extension: unknown) => void;
  ui?: {
    settings: {
      getSettingValue: (id: string, defaultValue?: unknown) => unknown;
      settingsLookup?: Record<
        string,
        {
          onChange?: (newValue: unknown, oldValue?: unknown) => void | Promise<void>;
        }
      >;
    };
  };
}

interface PingLogger {
  warn: (message: string) => void;
}

export const DEFAULT_SUCCESS_SOUND_ID = "bundled:ping-success.wav";
export const DEFAULT_FAILURE_SOUND_ID = "bundled:ping-failure.wav";
export const PING_EVENT_NAME = "comfyui-ping.notification";
const DEFAULT_SOUND_CATALOG: SoundCatalogPayload = {
  sounds: [
    { name: "beep-ping.wav", source: "bundled" },
    { name: "harmonic-beep.wav", source: "bundled" },
    { name: "notification-soft.wav", source: "bundled" },
    { name: "ping-success.wav", source: "bundled" },
    { name: "ping-failure.wav", source: "bundled" },
    { name: "ping-ringtone.wav", source: "bundled" },
  ],
};

export const PING_SETTINGS_IDS = {
  VERSION: SETTINGS_IDS.VERSION,
  DEBUG_LOGGING: SETTINGS_IDS.DEBUG_LOGGING,
  GLOBAL_ENABLED: `${SETTINGS_PREFIX}.Notifications Enabled`,
  NOTIFY_MODE: `${SETTINGS_PREFIX}.Notify Mode`,
  SUCCESS_ENABLED: `${SETTINGS_PREFIX}.Success Enabled`,
  FAILURE_ENABLED: `${SETTINGS_PREFIX}.Failure Enabled`,
  SUCCESS_SOUND: `${SETTINGS_PREFIX}.Success Sound`,
  FAILURE_SOUND: `${SETTINGS_PREFIX}.Failure Sound`,
  UPLOAD_ACTION: `${SETTINGS_PREFIX}.Upload Action`,
  VOLUME: `${SETTINGS_PREFIX}.Volume`,
} as const;

export const PING_NOTIFY_MODES: PingSettingOption[] = [
  {
    text: "Every Prompt",
    value: "every_prompt",
  },
  {
    text: "Queue Drained",
    value: "queue_drained",
  },
];

function createHomepageRenderer(): HTMLSpanElement {
  const spanEl = document.createElement("span");
  const linkEl = document.createElement("a");
  linkEl.href = "https://github.com/PBandDev/comfyui-ping";
  linkEl.target = "_blank";
  linkEl.rel = "noopener noreferrer";
  linkEl.style.paddingRight = "12px";
  linkEl.textContent = "Homepage";
  spanEl.append(linkEl);
  return spanEl;
}

function coerceSettingString(
  value: unknown,
  fallbackValue: SoundOptionId
): string {
  return typeof value === "string" && value.length > 0 ? value : fallbackValue;
}

function coerceSettingBoolean(value: unknown, fallbackValue: boolean): boolean {
  return typeof value === "boolean" ? value : fallbackValue;
}

function coerceSettingVolume(value: unknown, fallbackValue: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallbackValue;
  }

  return Math.min(1, Math.max(0, value));
}

export function buildSoundSettingOptions(
  catalog: SoundCatalogPayload
): PingSettingOption[] {
  return catalog.sounds.map((entry) => ({
    text: `${entry.source === "bundled" ? "Bundled" : "Custom"} / ${entry.name}`,
    value: toSoundOptionId(entry),
  }));
}

function buildUnavailableSoundOption(soundId: string): PingSettingOption {
  const separatorIndex = soundId.indexOf(":");
  const source = separatorIndex === -1 ? "" : soundId.slice(0, separatorIndex);
  const name = separatorIndex === -1 ? soundId : soundId.slice(separatorIndex + 1);
  const sourceLabel =
    source === "custom" ? "Custom" : source === "bundled" ? "Bundled" : "Sound";

  return {
    text: `${sourceLabel} / ${name} (unavailable)`,
    value: soundId,
  };
}

export function buildRenderedSoundOptions(
  options: PingSettingOption[],
  selectedValue: string
): PingSettingOption[] {
  if (selectedValue.length === 0) {
    return options;
  }

  if (options.some((option) => option.value === selectedValue)) {
    return options;
  }

  return [buildUnavailableSoundOption(selectedValue), ...options];
}

function findSetting(settingId: string): PingSetting | undefined {
  return PING_SETTINGS.find((setting) => setting.id === settingId);
}

let currentSoundCatalog = DEFAULT_SOUND_CATALOG;
const soundCatalogSubscribers = new Set<
  (catalog: SoundCatalogPayload) => void
>();

function subscribeToSoundCatalog(
  listener: (catalog: SoundCatalogPayload) => void
): () => void {
  soundCatalogSubscribers.add(listener);
  listener(currentSoundCatalog);
  return () => {
    soundCatalogSubscribers.delete(listener);
  };
}

function notifySoundCatalogSubscribers(): void {
  for (const listener of soundCatalogSubscribers) {
    listener(currentSoundCatalog);
  }
}

export function applySoundCatalogToSettings(
  catalog: SoundCatalogPayload
): SoundCatalogPayload {
  currentSoundCatalog = catalog;
  const options = buildSoundSettingOptions(catalog);

  for (const settingId of [
    PING_SETTINGS_IDS.SUCCESS_SOUND,
    PING_SETTINGS_IDS.FAILURE_SOUND,
  ]) {
    const setting = findSetting(settingId);
    if (setting) {
      setting.options = options;
    }
  }

  notifySoundCatalogSubscribers();
  return currentSoundCatalog;
}

function populateSoundSelect(
  selectEl: HTMLSelectElement,
  options: PingSettingOption[],
  selectedValue: string
): void {
  const renderedOptions = buildRenderedSoundOptions(options, selectedValue);
  selectEl.replaceChildren();

  for (const option of renderedOptions) {
    const optionEl = document.createElement("option");
    optionEl.textContent = option.text;
    optionEl.value = option.value;
    optionEl.selected = option.value === selectedValue;
    selectEl.append(optionEl);
  }

  if (selectedValue.length > 0) {
    selectEl.value = selectedValue;
  } else if (selectEl.options.length > 0 && selectEl.selectedIndex === -1) {
    selectEl.value = selectEl.options[0].value;
  }
}

function createSoundSelectRenderer(
  settingId: string,
  fallbackValue: SoundOptionId
): PingSettingRenderer {
  return (name: string, setter: (value: unknown) => void, value: unknown) => {
    const wrapperEl = document.createElement("label");
    const labelEl = document.createElement("span");
    const controlsEl = document.createElement("div");
    const selectEl = document.createElement("select");
    const playButtonEl = document.createElement("button");
    wrapperEl.style.display = "flex";
    wrapperEl.style.flexDirection = "column";
    wrapperEl.style.gap = "6px";
    controlsEl.style.display = "flex";
    controlsEl.style.gap = "8px";
    selectEl.style.flex = "1";
    labelEl.textContent = name;
    playButtonEl.type = "button";
    playButtonEl.textContent = "Play";
    selectEl.addEventListener("change", () => {
      const runtimeApp = getRuntimeApp();
      const settingsUi = runtimeApp?.ui?.settings;
      const nextValue = selectEl.value;
      const previousValue = settingsUi?.getSettingValue(settingId, fallbackValue);

      setter(nextValue);

      const onChange = settingsUi?.settingsLookup?.[settingId]?.onChange;
      if (onChange) {
        void onChange(nextValue, previousValue);
      }
    });
    playButtonEl.addEventListener("click", () => {
      const runtimeApp = getRuntimeApp();
      if (!runtimeApp) {
        return;
      }

      void previewSoundSelection(
        runtimeApp,
        selectEl.value || coerceSettingString(value, fallbackValue)
      );
    });

    subscribeToSoundCatalog((catalog) => {
      const selectedValue =
        selectEl.value || coerceSettingString(value, fallbackValue);
      populateSoundSelect(
        selectEl,
        buildSoundSettingOptions(catalog),
        selectedValue
      );
    });

    controlsEl.append(selectEl, playButtonEl);
    wrapperEl.append(labelEl, controlsEl);
    return wrapperEl;
  };
}

export async function refreshSoundCatalog(
  comfyApp: PingAppLike
): Promise<SoundCatalogPayload | null> {
  if (!comfyApp.api) {
    return null;
  }

  return applySoundCatalogToSettings(await fetchSoundCatalog(comfyApp.api));
}

export async function uploadCustomSound(
  comfyApp: PingAppLike,
  file: File
): Promise<SoundCatalogPayload | null> {
  if (!comfyApp.api) {
    return null;
  }

  return applySoundCatalogToSettings(await uploadSoundFile(comfyApp.api, file));
}

export function readRuntimeNotificationSettings(
  comfyApp: PingAppLike
): RuntimeNotificationSettings | null {
  const settingsUi = comfyApp.ui?.settings;
  if (!settingsUi) {
    return null;
  }

  return {
    enabled: coerceSettingBoolean(
      settingsUi.getSettingValue(PING_SETTINGS_IDS.GLOBAL_ENABLED, true),
      true
    ),
    failure_enabled: coerceSettingBoolean(
      settingsUi.getSettingValue(PING_SETTINGS_IDS.FAILURE_ENABLED, true),
      true
    ),
    failure_sound: coerceSettingString(
      settingsUi.getSettingValue(
        PING_SETTINGS_IDS.FAILURE_SOUND,
        DEFAULT_FAILURE_SOUND_ID
      ),
      DEFAULT_FAILURE_SOUND_ID
    ),
    notify_mode:
      settingsUi.getSettingValue(
        PING_SETTINGS_IDS.NOTIFY_MODE,
        "queue_drained"
      ) === "every_prompt"
        ? "every_prompt"
        : "queue_drained",
    success_enabled: coerceSettingBoolean(
      settingsUi.getSettingValue(PING_SETTINGS_IDS.SUCCESS_ENABLED, true),
      true
    ),
    success_sound: coerceSettingString(
      settingsUi.getSettingValue(
        PING_SETTINGS_IDS.SUCCESS_SOUND,
        DEFAULT_SUCCESS_SOUND_ID
      ),
      DEFAULT_SUCCESS_SOUND_ID
    ),
    volume: coerceSettingVolume(
      settingsUi.getSettingValue(PING_SETTINGS_IDS.VOLUME, 0.8),
      0.8
    ),
  };
}

export async function syncRuntimeSettings(
  comfyApp: PingAppLike
): Promise<RuntimeNotificationSettings | null> {
  if (!comfyApp.api) {
    return null;
  }

  const settings = readRuntimeNotificationSettings(comfyApp);
  if (!settings) {
    return null;
  }

  return storeRuntimeSettings(comfyApp.api, settings);
}

async function previewSoundSelection(
  comfyApp: PingAppLike,
  soundId: string,
  logger: PingLogger = getLogger()
): Promise<void> {
  const settingsUi = comfyApp.ui?.settings;
  if (!settingsUi) {
    return;
  }

  const result = await handleNotificationEvent({
    catalog: currentSoundCatalog.sounds,
    createAudio: createBrowserAudio,
    currentAudio: currentNotificationAudio,
    detail: {
      event_kind: "preview",
      sound_id: soundId,
      source: "settings",
      status: "success",
      volume: coerceSettingVolume(
        settingsUi.getSettingValue(PING_SETTINGS_IDS.VOLUME, 0.8),
        0.8
      ),
    },
    logger,
  });

  currentNotificationAudio = result.audio;
}

async function trySyncRuntimeSettings(
  comfyApp: PingAppLike,
  logger: PingLogger = getLogger()
): Promise<RuntimeNotificationSettings | null> {
  try {
    return await syncRuntimeSettings(comfyApp);
  } catch (error) {
    logger.warn(
      `Unable to sync runtime settings: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function tryUploadCustomSound(
  comfyApp: PingAppLike,
  file: File,
  logger: PingLogger = getLogger()
): Promise<SoundCatalogPayload | null> {
  try {
    return await uploadCustomSound(comfyApp, file);
  } catch (error) {
    logger.warn(
      `Unable to upload custom sound: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function getRuntimeApp(): PingAppLike | null {
  return typeof app === "undefined" ? null : (app as PingAppLike);
}

function createSettingsSyncOnChange(): (
  newValue: unknown,
  oldValue?: unknown
) => void {
  return () => {
    const runtimeApp = getRuntimeApp();
    if (!runtimeApp) {
      return;
    }

    void trySyncRuntimeSettings(runtimeApp);
  };
}

function createUploadActionRenderer(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Upload Custom Sound";
  button.addEventListener("click", () => {
    const runtimeApp = getRuntimeApp();
    if (!runtimeApp?.api) {
      return;
    }

    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.accept = ".wav,.mp3,.ogg,.m4a,.flac,audio/*";
    inputEl.addEventListener(
      "change",
      () => {
        const file = inputEl.files?.item(0);
        if (!file) {
          return;
        }

        void tryUploadCustomSound(runtimeApp, file);
      },
      { once: true }
    );
    inputEl.click();
  });
  return button;
}

export const PING_SETTINGS: PingSetting[] = [
  {
    id: PING_SETTINGS_IDS.VERSION,
    name: "Version 1.0.0",
    type: createHomepageRenderer,
    defaultValue: undefined,
  },
  {
    id: PING_SETTINGS_IDS.DEBUG_LOGGING,
    name: "Enable Debug Logging",
    type: "boolean",
    tooltip: "Show detailed debug logs in browser console during operation",
    defaultValue: false,
  },
  {
    id: PING_SETTINGS_IDS.GLOBAL_ENABLED,
    name: "Enable Workflow Notifications",
    type: "boolean",
    defaultValue: true,
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.NOTIFY_MODE,
    name: "Global Notify Mode",
    type: "combo",
    defaultValue: "queue_drained" satisfies PingNotifyMode,
    options: PING_NOTIFY_MODES,
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.SUCCESS_ENABLED,
    name: "Notify On Success",
    type: "boolean",
    defaultValue: true,
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.FAILURE_ENABLED,
    name: "Notify On Failure",
    type: "boolean",
    defaultValue: true,
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.SUCCESS_SOUND,
    name: "Success Sound",
    type: createSoundSelectRenderer(
      PING_SETTINGS_IDS.SUCCESS_SOUND,
      DEFAULT_SUCCESS_SOUND_ID
    ),
    defaultValue: DEFAULT_SUCCESS_SOUND_ID,
    options: buildSoundSettingOptions(DEFAULT_SOUND_CATALOG),
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.FAILURE_SOUND,
    name: "Failure Sound",
    type: createSoundSelectRenderer(
      PING_SETTINGS_IDS.FAILURE_SOUND,
      DEFAULT_FAILURE_SOUND_ID
    ),
    defaultValue: DEFAULT_FAILURE_SOUND_ID,
    options: buildSoundSettingOptions(DEFAULT_SOUND_CATALOG),
    onChange: createSettingsSyncOnChange(),
  },
  {
    id: PING_SETTINGS_IDS.UPLOAD_ACTION,
    name: "Upload Custom Sound",
    type: createUploadActionRenderer,
    defaultValue: undefined,
    tooltip: "Upload a custom browser-played notification sound.",
  },
  {
    id: PING_SETTINGS_IDS.VOLUME,
    name: "Notification Volume",
    type: "slider",
    defaultValue: 0.8,
    onChange: createSettingsSyncOnChange(),
    attrs: {
      min: 0,
      max: 1,
      step: 0.05,
    },
  },
];

let currentNotificationAudio: ManagedAudio | null = null;
let subscribedNotificationApi: PingAppApi | null = null;

function createBrowserAudio(audioUrl: string): HTMLAudioElement {
  return new Audio(audioUrl);
}

function getLogger(): PingLogger {
  return {
    warn: (message: string) => {
      console.warn(message);
    },
  };
}

export function subscribeToPingNotificationEvents(
  comfyApp: PingAppLike
): void {
  if (!comfyApp.api || subscribedNotificationApi === comfyApp.api) {
    return;
  }

  subscribedNotificationApi = comfyApp.api;
  comfyApp.api.addEventListener(PING_EVENT_NAME, (event) => {
    void handleNotificationEvent({
      catalog: currentSoundCatalog.sounds,
      createAudio: createBrowserAudio,
      currentAudio: currentNotificationAudio,
      detail: event.detail,
      logger: getLogger(),
    }).then((result) => {
      currentNotificationAudio = result.audio;
    });
  });
}

export const PING_EXTENSION = {
  name: "comfyui-ping",
  settings: PING_SETTINGS,
  async setup() {
    if (typeof app !== "undefined") {
      try {
        await refreshSoundCatalog(app as PingAppLike);
      } catch (error) {
        getLogger().warn(
          `Unable to refresh sound catalog: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      await trySyncRuntimeSettings(app as PingAppLike);

      subscribeToPingNotificationEvents(app as PingAppLike);
    }
  },
};

if (typeof app !== "undefined") {
  app.registerExtension(PING_EXTENSION);
}
