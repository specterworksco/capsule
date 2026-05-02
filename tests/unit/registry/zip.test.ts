import { describe, expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { readCapsuleContent } from "../../../apps/registry/src/zip";

function makeValidArchive(overrides?: Record<string, unknown>): Uint8Array {
  const manifest = {
    name: "my-app",
    version: "1.0.0",
    entry: "bundle.js",
    author: "Alice <alice@example.com>",
    ...overrides,
  };
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "bundle.js": strToU8("console.log('hello')"),
    },
    { level: 1 },
  );
}

describe("readCapsuleContent", () => {
  test("reads valid archive", () => {
    const bytes = makeValidArchive();
    const result = readCapsuleContent(bytes);
    expect(result.manifest.name).toBe("my-app");
    expect(result.manifest.version).toBe("1.0.0");
    expect(result.manifestBytes).toBeInstanceOf(Uint8Array);
    expect(result.bundleBytes).toBeInstanceOf(Uint8Array);
  });

  test("throws on corrupt bytes", () => {
    expect(() => readCapsuleContent(new Uint8Array([1, 2, 3]))).toThrow("Invalid capsule archive");
  });

  test("throws when manifest.json is missing", () => {
    const bytes = zipSync({ "bundle.js": strToU8("") }, { level: 1 });
    expect(() => readCapsuleContent(bytes)).toThrow("missing manifest.json");
  });

  test("throws when bundle.js is missing", () => {
    const bytes = zipSync({ "manifest.json": strToU8('{"name":"x"}') }, { level: 1 });
    expect(() => readCapsuleContent(bytes)).toThrow("missing bundle.js");
  });

  test("throws on invalid manifest name", () => {
    const bytes = makeValidArchive({ name: "My-App" });
    expect(() => readCapsuleContent(bytes)).toThrow("Invalid package name");
  });

  test("throws on invalid manifest version", () => {
    const bytes = makeValidArchive({ version: "abc" });
    expect(() => readCapsuleContent(bytes)).toThrow("Invalid package version");
  });

  test("throws when author is missing", () => {
    const bytes = makeValidArchive({ author: "" });
    expect(() => readCapsuleContent(bytes)).toThrow("author is required");
  });

  test("throws when author is just whitespace", () => {
    const bytes = makeValidArchive({ author: "   " });
    expect(() => readCapsuleContent(bytes)).toThrow("author is required");
  });

  test("accepts valid pre-release version", () => {
    const bytes = makeValidArchive({ version: "1.0.0-beta.2" });
    const result = readCapsuleContent(bytes);
    expect(result.manifest.version).toBe("1.0.0-beta.2");
  });

  test("accepts valid build metadata version", () => {
    const bytes = makeValidArchive({ version: "1.0.0+build42" });
    const result = readCapsuleContent(bytes);
    expect(result.manifest.version).toBe("1.0.0+build42");
  });
});
