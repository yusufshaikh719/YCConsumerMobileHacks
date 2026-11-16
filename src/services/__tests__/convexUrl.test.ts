import { describe, expect, it } from "vitest";
import { DEFAULT_CONVEX_URL, resolveConvexUrl } from "../convexUrl";

describe("convex url resolution", () => {
  it("syncs through the public dev deployment with no env setup", () => {
    expect(resolveConvexUrl({})).toBe("https://brilliant-crow-271.convex.cloud");
    expect(resolveConvexUrl({ url: "  " })).toBe(DEFAULT_CONVEX_URL);
  });

  it("lets EXPO_PUBLIC_CONVEX_URL override the default", () => {
    expect(resolveConvexUrl({ url: " https://happy-otter-123.convex.cloud " })).toBe("https://happy-otter-123.convex.cloud");
  });

  it("runs offline only when explicitly opted out", () => {
    expect(resolveConvexUrl({ offline: "1" })).toBeNull();
    expect(resolveConvexUrl({ offline: "true", url: "https://happy-otter-123.convex.cloud" })).toBeNull();
    expect(resolveConvexUrl({ offline: "0" })).toBe(DEFAULT_CONVEX_URL);
  });
});
