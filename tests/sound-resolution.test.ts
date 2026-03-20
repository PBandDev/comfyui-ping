import { describe, expect, it } from "vitest";
import { resolveSoundSelection } from "../src/resolve-sound";

describe("resolveSoundSelection", () => {
  it("prefers node override over global sound", () => {
    expect(
      resolveSoundSelection({
        status: "success",
        nodeOverrides: { successSound: "bundled:node.wav" },
        globalSettings: { successSound: "bundled:global.wav" },
      })
    ).toBe("node.wav");
  });

  it("falls back to the matching global sound", () => {
    expect(
      resolveSoundSelection({
        status: "failure",
        nodeOverrides: {},
        globalSettings: { failureSound: "custom:failure.wav" },
      })
    ).toBe("failure.wav");
  });

  it("returns null when no matching sound is configured", () => {
    expect(
      resolveSoundSelection({
        status: "failure",
        nodeOverrides: { successSound: "bundled:success.wav" },
        globalSettings: {},
      })
    ).toBeNull();
  });
});
