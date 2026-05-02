import { describe, expect, test } from "bun:test";
import { compareVersions } from "../../../apps/registry/src/semver";

describe("compareVersions", () => {
  test("returns 0 for identical versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  test("returns negative when a < b on major", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
  });

  test("returns positive when a > b on major", () => {
    expect(compareVersions("3.0.0", "2.0.0")).toBeGreaterThan(0);
  });

  test("returns negative when a < b on minor", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
  });

  test("returns positive when a > b on minor", () => {
    expect(compareVersions("1.2.0", "1.1.0")).toBeGreaterThan(0);
  });

  test("returns negative when a < b on patch", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  test("returns positive when a > b on patch", () => {
    expect(compareVersions("1.0.5", "1.0.4")).toBeGreaterThan(0);
  });

  test("strips pre-release suffixes, compares core", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(0);
  });

  test("strips build metadata, compares core", () => {
    expect(compareVersions("1.0.0", "1.0.0+build1")).toBe(0);
  });

  test("handles missing parts as 0", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  test("handles two-part versions", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });

  test("handles ascending steps", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.0.1", "1.1.0")).toBeLessThan(0);
    expect(compareVersions("1.1.0", "2.0.0")).toBeLessThan(0);
  });

  test("handles descending steps", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.9.9", "1.9.8")).toBeGreaterThan(0);
  });

  test("handles versions with 10+ parts", () => {
    expect(compareVersions("10.0.0", "9.0.0")).toBeGreaterThan(0);
  });
});
