import { SOUND_SOURCES } from "./constants";

export type SoundSource =
  (typeof SOUND_SOURCES)[keyof typeof SOUND_SOURCES];

export interface FetchApiClient {
  fetchApi: (route: string, options?: RequestInit) => Promise<Response>;
}

export interface SoundCatalogEntry {
  name: string;
  source: SoundSource;
}

export interface SoundCatalogPayload {
  sounds: SoundCatalogEntry[];
}

export type SoundOptionId = `${SoundSource}:${string}`;
export interface RuntimeNotificationSettings {
  enabled: boolean;
  notify_mode: "every_prompt" | "queue_drained";
  success_enabled: boolean;
  failure_enabled: boolean;
  success_sound: string;
  failure_sound: string;
  volume: number;
}

export const SOUND_CATALOG_ROUTE = "/comfyui-ping/sounds";
export const SOUND_UPLOAD_ROUTE = "/comfyui-ping/sounds/upload";
export const SETTINGS_ROUTE = "/comfyui-ping/settings";

export function toSoundOptionId(entry: SoundCatalogEntry): SoundOptionId {
  return `${entry.source}:${entry.name}`;
}

export function normalizeSoundOptionId(
  soundId: string | null | undefined
): SoundOptionId | null {
  if (!soundId) {
    return null;
  }

  if (soundId.includes(":")) {
    return toSoundOptionId(parseSoundOptionId(soundId));
  }

  return `bundled:${soundId}`;
}

export function parseSoundOptionId(soundId: string): SoundCatalogEntry {
  const separatorIndex = soundId.indexOf(":");
  const source = soundId.slice(0, separatorIndex);
  const name = soundId.slice(separatorIndex + 1);

  if (
    source !== SOUND_SOURCES.BUNDLED &&
    source !== SOUND_SOURCES.CUSTOM
  ) {
    throw new Error(`Unsupported sound source: ${source}`);
  }

  return {
    name,
    source,
  };
}

export function buildSoundCatalogRoute(): string {
  return SOUND_CATALOG_ROUTE;
}

export function buildSoundUploadRoute(): string {
  return SOUND_UPLOAD_ROUTE;
}

export function buildSettingsRoute(): string {
  return SETTINGS_ROUTE;
}

export function buildSoundFileRoute(entry: SoundCatalogEntry): string {
  return `${SOUND_CATALOG_ROUTE}/${encodeURIComponent(entry.source)}/${encodeURIComponent(entry.name)}`;
}

export function parseSoundCatalogPayload(input: {
  sounds?: Array<{
    name?: string;
    source?: string;
  }>;
}): SoundCatalogPayload {
  const sounds = input.sounds ?? [];

  return {
    sounds: sounds.flatMap((entry) => {
      if (
        typeof entry.name !== "string" ||
        (entry.source !== SOUND_SOURCES.BUNDLED &&
          entry.source !== SOUND_SOURCES.CUSTOM)
      ) {
        return [];
      }

      return [
        {
          name: entry.name,
          source: entry.source,
        },
      ];
    }),
  };
}

async function parseCatalogResponse(
  response: Response
): Promise<SoundCatalogPayload> {
  if (!response.ok) {
    throw new Error(`Sound catalog request failed with status ${response.status}`);
  }

  const payload: {
    sounds?: Array<{
      name?: string;
      source?: string;
    }>;
  } = await response.json();

  return parseSoundCatalogPayload(payload);
}

export async function fetchSoundCatalog(
  client: FetchApiClient
): Promise<SoundCatalogPayload> {
  return parseCatalogResponse(
    await client.fetchApi(buildSoundCatalogRoute(), undefined)
  );
}

export async function uploadSoundFile(
  client: FetchApiClient,
  file: File
): Promise<SoundCatalogPayload> {
  const formData = new FormData();
  formData.append("file", file);

  return parseCatalogResponse(
    await client.fetchApi(buildSoundUploadRoute(), {
      body: formData,
      method: "POST",
    })
  );
}

export async function storeRuntimeSettings(
  client: FetchApiClient,
  settings: RuntimeNotificationSettings
): Promise<RuntimeNotificationSettings> {
  const response = await client.fetchApi(buildSettingsRoute(), {
    body: JSON.stringify(settings),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Settings request failed with status ${response.status}`);
  }

  return (await response.json()) as RuntimeNotificationSettings;
}
