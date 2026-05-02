import { describe, expect, test } from "bun:test";
import { CapsuleConfigSchema, ManifestSchema } from "../../../packages/shared/src/index";

describe("CapsuleConfigSchema", () => {
  const valid = { name: "my-app", version: "1.0.0", entry: "src/index.ts" };

  test("accepts minimal valid config", () => {
    expect(CapsuleConfigSchema.parse(valid)).toEqual(valid);
  });

  test("accepts config with all fields", () => {
    const withAll = { ...valid, author: "Test", description: "Test app", assets: ["asset1", "asset2"] };
    expect(CapsuleConfigSchema.parse(withAll)).toEqual(withAll);
  });

  test("rejects empty name", () => {
    expect(() => CapsuleConfigSchema.parse({ ...valid, name: "" })).toThrow();
  });

  test("rejects missing name", () => {
    const { name: _, ...rest } = valid;
    expect(() => CapsuleConfigSchema.parse(rest)).toThrow();
  });

  test("rejects empty version", () => {
    expect(() => CapsuleConfigSchema.parse({ ...valid, version: "" })).toThrow();
  });

  test("rejects empty entry", () => {
    expect(() => CapsuleConfigSchema.parse({ ...valid, entry: "" })).toThrow();
  });

  test("accepts optional author as string", () => {
    expect(CapsuleConfigSchema.parse({ ...valid, author: "Alice" }).author).toBe("Alice");
  });

  test("accepts optional description", () => {
    expect(CapsuleConfigSchema.parse({ ...valid, description: "My app" }).description).toBe("My app");
  });

  test("rejects non-string assets", () => {
    expect(() => CapsuleConfigSchema.parse({ ...valid, assets: ["ok", 123] })).toThrow();
  });
});

describe("ManifestSchema", () => {
  const valid = { name: "my-app", version: "1.0.0", entry: "bundle.js" as const };

  test("accepts minimal valid manifest", () => {
    expect(ManifestSchema.parse(valid)).toEqual(valid);
  });

  test("accepts manifest with all optional fields", () => {
    const full = { ...valid, author: "Alice", description: "Test" };
    expect(ManifestSchema.parse(full)).toEqual(full);
  });

  test("rejects entry other than bundle.js", () => {
    expect(() => ManifestSchema.parse({ ...valid, entry: "index.js" })).toThrow();
  });

  test("rejects empty name", () => {
    expect(() => ManifestSchema.parse({ ...valid, name: "" })).toThrow();
  });

  test("rejects empty version", () => {
    expect(() => ManifestSchema.parse({ ...valid, version: "" })).toThrow();
  });
});
