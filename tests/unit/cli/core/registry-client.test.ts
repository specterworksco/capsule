import { afterEach, describe, expect, test } from "bun:test";
import { resolveRegistryServer } from "../../../../apps/cli/src/core/registry-client";

describe("resolveRegistryServer", () => {
  const originalEnv = process.env.CAPSULE_REGISTRY_SERVER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CAPSULE_REGISTRY_SERVER;
    } else {
      process.env.CAPSULE_REGISTRY_SERVER = originalEnv;
    }
  });

  test("uses provided value when given", () => {
    expect(resolveRegistryServer("https://custom.registry.test")).toBe("https://custom.registry.test");
  });

  test("strips trailing slash", () => {
    expect(resolveRegistryServer("https://registry.test/")).toBe("https://registry.test");
  });

  test("uses CAPSULE_REGISTRY_SERVER env var when no value given", () => {
    process.env.CAPSULE_REGISTRY_SERVER = "https://env.registry.test";
    expect(resolveRegistryServer()).toBe("https://env.registry.test");
  });

  test("falls back to default", () => {
    delete process.env.CAPSULE_REGISTRY_SERVER;
    expect(resolveRegistryServer()).toBe("https://registry.usecapsule.net");
  });

  test("throws on invalid URL", () => {
    expect(() => resolveRegistryServer("not-a-url")).toThrow("Invalid registry server URL");
  });

  test("empty string falls back to default", () => {
    delete process.env.CAPSULE_REGISTRY_SERVER;
    expect(resolveRegistryServer("")).toBe("https://registry.usecapsule.net");
  });
});
