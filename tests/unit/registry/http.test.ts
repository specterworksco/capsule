import { describe, expect, test } from "bun:test";
import { MAX_UPLOAD_BYTES, parseName, parseVersion } from "../../../apps/registry/src/http";

describe("MAX_UPLOAD_BYTES", () => {
  test("is 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("parseName", () => {
  test("returns name for valid input", () => {
    expect(parseName("my-app")).toBe("my-app");
  });

  test("returns null for undefined", () => {
    expect(parseName(undefined)).toBeNull();
  });

  test("returns null for invalid name", () => {
    expect(parseName("MyApp")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseName("")).toBeNull();
  });
});

describe("parseVersion", () => {
  test("returns version for valid input", () => {
    expect(parseVersion("1.0.0")).toBe("1.0.0");
  });

  test("returns null for undefined", () => {
    expect(parseVersion(undefined)).toBeNull();
  });

  test("returns null for invalid version", () => {
    expect(parseVersion("abc")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseVersion("")).toBeNull();
  });
});
