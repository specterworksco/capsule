import { describe, expect, test } from "bun:test";
import { configToManifest, parseManifest } from "../../../../apps/cli/src/core/manifest";

describe("configToManifest", () => {
  test("converts config to manifest", () => {
    const manifest = configToManifest({ name: "my-app", version: "1.0.0", entry: "src/index.ts" });
    expect(manifest).toEqual({
      name: "my-app",
      version: "1.0.0",
      entry: "bundle.js",
    });
  });

  test("includes optional author", () => {
    const manifest = configToManifest({ name: "my-app", version: "1.0.0", entry: "index.ts", author: "Alice" });
    expect(manifest.author).toBe("Alice");
  });

  test("includes optional description", () => {
    const manifest = configToManifest({ name: "my-app", version: "1.0.0", entry: "index.ts", description: "Test" });
    expect(manifest.description).toBe("Test");
  });

  test("entry is always bundle.js regardless of input", () => {
    let manifest = configToManifest({ name: "my-app", version: "1.0.0", entry: "src/index.ts" });
    expect(manifest.entry).toBe("bundle.js");

    manifest = configToManifest({ name: "my-app", version: "1.0.0", entry: "other.js" });
    expect(manifest.entry).toBe("bundle.js");
  });
});

describe("parseManifest", () => {
  test("parses valid manifest object", () => {
    const manifest = parseManifest({ name: "test", version: "1.0.0", entry: "bundle.js" });
    expect(manifest).toEqual({ name: "test", version: "1.0.0", entry: "bundle.js" });
  });

  test("parses manifest with optional fields", () => {
    const manifest = parseManifest({ name: "test", version: "1.0.0", entry: "bundle.js", author: "Bob", description: "desc" });
    expect(manifest.author).toBe("Bob");
    expect(manifest.description).toBe("desc");
  });

  test("rejects missing name", () => {
    expect(() => parseManifest({ version: "1.0.0", entry: "bundle.js" })).toThrow();
  });

  test("rejects missing version", () => {
    expect(() => parseManifest({ name: "test", entry: "bundle.js" })).toThrow();
  });

  test("rejects wrong entry", () => {
    expect(() => parseManifest({ name: "test", version: "1.0.0", entry: "index.js" })).toThrow();
  });

  test("rejects null input", () => {
    expect(() => parseManifest(null)).toThrow();
  });

  test("rejects undefined input", () => {
    expect(() => parseManifest(undefined)).toThrow();
  });

  test("rejects empty object", () => {
    expect(() => parseManifest({})).toThrow();
  });
});
