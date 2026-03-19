import {
  buildSoundFileRoute,
  normalizeSoundOptionId,
  parseSoundOptionId,
  type SoundCatalogEntry,
  type SoundOptionId,
} from "./api";

export interface ManagedAudio {
  currentTime: number;
  pause?: () => void;
  play: () => Promise<void> | void;
  volume: number;
}

export interface NotificationLogger {
  warn: (message: string) => void;
}

export interface ShouldPlayNotificationInput {
  selectedSound: SoundOptionId | string | null;
  soundExists: boolean;
  isCustom: boolean;
}

export interface PlayNotificationInput extends ShouldPlayNotificationInput {
  audioUrl: string | null;
  createAudio: (audioUrl: string) => ManagedAudio;
  currentAudio?: ManagedAudio | null;
  logger?: NotificationLogger;
  stopPrevious?: boolean;
  volume: number;
}

export interface PlayNotificationResult {
  audio: ManagedAudio | null;
  played: boolean;
}

export interface NotificationEventDetail {
  event_kind: string;
  status: "success" | "failure";
  sound_id: SoundOptionId | string | null;
  volume: number;
  source: string;
}
export function catalogHasSound(
  catalog: SoundCatalogEntry[] | undefined,
  entry: SoundCatalogEntry
): boolean {
  if (!catalog) {
    return true;
  }

  return catalog.some(
    (catalogEntry) =>
      catalogEntry.name === entry.name && catalogEntry.source === entry.source
  );
}

export function resolveNotificationAudioUrl(
  soundId: NotificationEventDetail["sound_id"]
): string | null {
  const normalizedSoundId = normalizeSoundOptionId(soundId);
  if (!normalizedSoundId) {
    return null;
  }

  return buildSoundFileRoute(parseSoundOptionId(normalizedSoundId));
}

export function shouldPlayNotification(
  input: ShouldPlayNotificationInput
): boolean {
  if (!input.selectedSound) {
    return false;
  }

  if (input.isCustom && !input.soundExists) {
    return false;
  }

  return input.soundExists || !input.isCustom;
}

export async function playNotification(
  input: PlayNotificationInput
): Promise<PlayNotificationResult> {
  if (!shouldPlayNotification(input) || !input.audioUrl) {
    if (input.currentAudio) {
      input.currentAudio.pause?.();
      input.currentAudio.currentTime = 0;
    }

    if (input.isCustom && input.selectedSound && !input.soundExists) {
      input.logger?.warn(
        `Selected custom sound '${input.selectedSound}' is unavailable; skipping playback.`
      );
    }

    return {
      audio: null,
      played: false,
    };
  }

  if (input.stopPrevious !== false && input.currentAudio) {
    input.currentAudio.pause?.();
    input.currentAudio.currentTime = 0;
  }

  const audio = input.createAudio(input.audioUrl);
  audio.volume = input.volume;
  try {
    await audio.play();
  } catch (error) {
    input.logger?.warn(
      `Unable to play notification audio: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    return {
      audio: null,
      played: false,
    };
  }

  return {
    audio,
    played: true,
  };
}

export async function handleNotificationEvent(input: {
  catalog?: SoundCatalogEntry[];
  createAudio: (audioUrl: string) => ManagedAudio;
  currentAudio?: ManagedAudio | null;
  detail: NotificationEventDetail;
  logger?: NotificationLogger;
  stopPrevious?: boolean;
}): Promise<PlayNotificationResult> {
  const selectedSound = normalizeSoundOptionId(input.detail.sound_id);
  const parsedSound = selectedSound ? parseSoundOptionId(selectedSound) : null;
  const isCustom = parsedSound?.source === "custom";
  const audioUrl = resolveNotificationAudioUrl(selectedSound);
  const soundExists = parsedSound
    ? catalogHasSound(input.catalog, parsedSound)
    : false;

  return playNotification({
    audioUrl,
    createAudio: input.createAudio,
    currentAudio: input.currentAudio,
    isCustom,
    logger: input.logger,
    selectedSound,
    soundExists,
    stopPrevious: input.stopPrevious,
    volume: input.detail.volume,
  });
}
