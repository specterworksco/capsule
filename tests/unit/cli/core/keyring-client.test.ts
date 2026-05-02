import { afterEach, describe, expect, test } from "bun:test";
import { resolveKeyringServer } from "../../../../apps/cli/src/core/keyring-client";

describe("resolveKeyringServer", () => {
  const originalEnv = process.env.CAPSULE_KEYRING_SERVER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CAPSULE_KEYRING_SERVER;
    } else {
      process.env.CAPSULE_KEYRING_SERVER = originalEnv;
    }
  });

  test("uses provided value when given", () => {
    expect(resolveKeyringServer("https://custom.keyring.test")).toBe("https://custom.keyring.test");
  });

  test("strips trailing slash", () => {
    expect(resolveKeyringServer("https://keyring.test/")).toBe("https://keyring.test");
  });

  test("uses CAPSULE_KEYRING_SERVER env var when no value given", () => {
    process.env.CAPSULE_KEYRING_SERVER = "https://env.keyring.test";
    expect(resolveKeyringServer()).toBe("https://env.keyring.test");
  });

  test("falls back to default", () => {
    delete process.env.CAPSULE_KEYRING_SERVER;
    expect(resolveKeyringServer()).toBe("https://keyring.usecapsule.net");
  });

  test("throws on invalid URL", () => {
    expect(() => resolveKeyringServer("not-a-url")).toThrow("Invalid keyring server URL");
  });

  test("empty string falls back to default when no env", () => {
    delete process.env.CAPSULE_KEYRING_SERVER;
    expect(resolveKeyringServer("")).toBe("https://keyring.usecapsule.net");
  });
});
