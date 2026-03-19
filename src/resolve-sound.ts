import type { SoundOptionId } from "./api";

type NotificationStatus = "success" | "failure";

interface SoundSettings {
  successSound?: SoundOptionId;
  failureSound?: SoundOptionId;
}

interface ResolveSoundSelectionInput {
  status: NotificationStatus;
  nodeOverrides?: SoundSettings;
  globalSettings: SoundSettings;
}

export function resolveSoundSelection(
  input: ResolveSoundSelectionInput
): SoundOptionId | null {
  if (input.status === "success") {
    return (
      input.nodeOverrides?.successSound ??
      input.globalSettings.successSound ??
      null
    );
  }

  return (
    input.nodeOverrides?.failureSound ??
    input.globalSettings.failureSound ??
    null
  );
}
