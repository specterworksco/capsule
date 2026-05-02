import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  resolveReleaseAssetName,
  compareVersions,
} from "../../../../apps/cli/src/core/upgrade";

describe("resolveReleaseAssetName", () => {
  afterEach(() => {
    mock.restore();
  });

  test("uses target when provided", () => {
    const result = resolveReleaseAssetName({ target: "bun-linux-x64" });
    expect(result).toBe("capsule-linux-x64");
  });

  test("throws on invalid target", () => {
    expect(() => resolveReleaseAssetName({ target: "invalid-target" })).toThrow("Unsupported upgrade target");
  });

  test("resolves macos x64", () => {
    mock.module("node:os", () => ({ platform: () => "darwin", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-macos-x64");
  });

  test("resolves macos arm64", () => {
    mock.module("node:os", () => ({ platform: () => "darwin", arch: () => "arm64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-macos-arm64");
  });

  test("resolves linux x64 default", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-linux-x64");
  });

  test("resolves linux x64 baseline", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "baseline" })).toBe("capsule-linux-x64-baseline");
  });

  test("resolves linux x64 modern", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "modern" })).toBe("capsule-linux-x64-modern");
  });

  test("resolves linux x64 musl", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "musl" })).toBe("capsule-linux-x64-musl");
  });

  test("resolves linux arm64 default", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "arm64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-linux-arm64");
  });

  test("resolves linux arm64 musl", () => {
    mock.module("node:os", () => ({ platform: () => "linux", arch: () => "arm64" }));
    expect(resolveReleaseAssetName({ variant: "musl" })).toBe("capsule-linux-arm64-musl");
  });

  test("resolves windows x64 default", () => {
    mock.module("node:os", () => ({ platform: () => "win32", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-windows-x64.exe");
  });

  test("resolves windows x64 baseline", () => {
    mock.module("node:os", () => ({ platform: () => "win32", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "baseline" })).toBe("capsule-windows-x64-baseline.exe");
  });

  test("resolves windows x64 modern", () => {
    mock.module("node:os", () => ({ platform: () => "win32", arch: () => "x64" }));
    expect(resolveReleaseAssetName({ variant: "modern" })).toBe("capsule-windows-x64-modern.exe");
  });

  test("resolves windows arm64 default", () => {
    mock.module("node:os", () => ({ platform: () => "win32", arch: () => "arm64" }));
    expect(resolveReleaseAssetName({ variant: "default" })).toBe("capsule-windows-arm64.exe");
  });

  test("throws on unsupported platform", () => {
    mock.module("node:os", () => ({ platform: () => "freebsd", arch: () => "x64" }));
    expect(() => resolveReleaseAssetName()).toThrow("Unsupported platform");
  });

  test("throws on unsupported variant", () => {
    mock.module("node:os", () => ({ platform: () => "darwin", arch: () => "arm64" }));
    expect(() => resolveReleaseAssetName({ variant: "musl" })).toThrow("Unsupported upgrade variant");
  });
});

describe("compareVersions", () => {
  test("returns 0 for identical", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  test("returns negative when a < b", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  test("returns positive when a > b", () => {
    expect(compareVersions("3.0.0", "2.0.0")).toBeGreaterThan(0);
  });

  test("treats pre-release as equal to release (stripped by split)", () => {
    expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(0);
  });

  test("returns negative on minor difference", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
  });

  test("returns positive on patch difference", () => {
    expect(compareVersions("1.0.5", "1.0.4")).toBeGreaterThan(0);
  });

  test("handles v prefix", () => {
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("v1.0.0", "v2.0.0")).toBeLessThan(0);
  });

  test("handles multi-digit parts", () => {
    expect(compareVersions("10.0.0", "9.0.0")).toBeGreaterThan(0);
  });

  test("handles different length parts", () => {
    expect(compareVersions("1.0.0.0", "1.0.0")).toBe(0);
  });
});
