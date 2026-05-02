import { describe, expect, test } from "bun:test";
import { appObjectKey } from "../../../apps/registry/src/r2";

describe("appObjectKey", () => {
  test("returns correct key for name and version", () => {
    expect(appObjectKey("my-app", "1.0.0")).toBe("apps/my-app/1.0.0.capsule.app");
  });

  test("handles hyphens in name", () => {
    expect(appObjectKey("my-cool-app", "2.0.0")).toBe("apps/my-cool-app/2.0.0.capsule.app");
  });

  test("handles pre-release versions", () => {
    expect(appObjectKey("app", "1.0.0-beta")).toBe("apps/app/1.0.0-beta.capsule.app");
  });
});
