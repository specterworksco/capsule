import { describe, expect, test } from "bun:test";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { createCapsuleArchive, readCapsuleArchive, getRequiredContentFiles } from "../../../../apps/cli/src/core/archive";

describe("createCapsuleArchive", () => {
  test("creates a valid zip with string content", () => {
    const bytes = createCapsuleArchive({
      "manifest.json": JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" }),
      "bundle.js": "console.log('hello')",
    });

    const files = unzipSync(bytes);
    expect(files["manifest.json"]).toBeInstanceOf(Uint8Array);
    expect(files["bundle.js"]).toBeInstanceOf(Uint8Array);
    expect(strFromU8(files["manifest.json"])).toContain("test");
  });

  test("creates a valid zip with Uint8Array content", () => {
    const bytes = createCapsuleArchive({
      "manifest.json": strToU8(JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" })),
      "bundle.js": strToU8("console.log('hello')"),
    });

    const files = unzipSync(bytes);
    expect(files["manifest.json"]).toBeInstanceOf(Uint8Array);
    expect(files["bundle.js"]).toBeInstanceOf(Uint8Array);
  });

  test("round-trips extra files", () => {
    const original = {
      "manifest.json": JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" }),
      "bundle.js": "code",
      "capsule.sig": JSON.stringify({ certificateId: "id", signature: "sig", publicKey: "key" }),
    };
    const bytes = createCapsuleArchive(original);
    const files = unzipSync(bytes);
    expect(files["capsule.sig"]).toBeInstanceOf(Uint8Array);
  });
});

describe("readCapsuleArchive", () => {
  function makeArchive(extra?: Record<string, string>) {
    return zipSync(
      {
        "manifest.json": strToU8(JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" })),
        "bundle.js": strToU8("code"),
        ...extra,
      },
      { level: 1 },
    );
  }

  test("reads valid archive without signature", () => {
    const archive = readCapsuleArchive(makeArchive());
    expect(archive.manifest.name).toBe("test");
    expect(archive.manifest.version).toBe("1.0.0");
    expect(archive.signature).toBeUndefined();
    expect(archive.files["manifest.json"]).toBeInstanceOf(Uint8Array);
    expect(archive.files["bundle.js"]).toBeInstanceOf(Uint8Array);
  });

  test("reads archive with signature", () => {
    const archive = readCapsuleArchive(makeArchive({ "capsule.sig": strToU8(JSON.stringify({ certificateId: "550e8400-e29b-41d4-a716-446655440000", signature: "sig", publicKey: "key" })) }));
    expect(archive.signature).toBeDefined();
    expect(archive.signature!.certificateId).toBeTruthy();
    expect(archive.signature!.signature).toBe("sig");
    expect(archive.signature!.publicKey).toBe("key");
  });

  test("throws on corrupt bytes", () => {
    expect(() => readCapsuleArchive(new Uint8Array([1, 2, 3]))).toThrow("Invalid capsule archive");
  });

  test("throws on missing manifest.json", () => {
    const bytes = zipSync({ "bundle.js": strToU8("code") }, { level: 1 });
    expect(() => readCapsuleArchive(bytes)).toThrow("missing manifest.json");
  });

  test("throws on missing bundle.js", () => {
    const bytes = zipSync({ "manifest.json": strToU8("{}") }, { level: 1 });
    expect(() => readCapsuleArchive(bytes)).toThrow("missing bundle.js");
  });

  test("throws on invalid manifest JSON", () => {
    const bytes = zipSync({ "manifest.json": strToU8("not-json"), "bundle.js": strToU8("code") }, { level: 1 });
    expect(() => readCapsuleArchive(bytes)).toThrow();
  });

  test("throws on invalid capsule.sig JSON", () => {
    const bytes = zipSync(
      {
        "manifest.json": strToU8(JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" })),
        "bundle.js": strToU8("code"),
        "capsule.sig": strToU8("not-json"),
      },
      { level: 1 },
    );
    expect(() => readCapsuleArchive(bytes)).toThrow();
  });
});

describe("getRequiredContentFiles", () => {
  test("returns manifestBytes and bundleBytes", () => {
    const archive = readCapsuleArchive(makeArchive());
    const { manifestBytes, bundleBytes } = getRequiredContentFiles(archive);
    expect(manifestBytes).toBeInstanceOf(Uint8Array);
    expect(bundleBytes).toBeInstanceOf(Uint8Array);
    expect(strFromU8(manifestBytes)).toContain("test");
    expect(strFromU8(bundleBytes)).toBe("code");
  });

  test("throws when manifest is missing from files", () => {
    const archive = readCapsuleArchive(makeArchive());
    delete archive.files["manifest.json"];
    expect(() => getRequiredContentFiles(archive)).toThrow("missing required content files");
  });

  function makeArchive(extra?: Record<string, string>) {
    return zipSync(
      {
        "manifest.json": strToU8(JSON.stringify({ name: "test", version: "1.0.0", entry: "bundle.js" })),
        "bundle.js": strToU8("code"),
        ...extra,
      },
      { level: 1 },
    );
  }
});
