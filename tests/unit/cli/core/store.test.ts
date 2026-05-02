import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getStoreRoot,
  getAppsDir,
  getBinDir,
  getCertificatePath,
  getAppDir,
  getInvokedAppName,
  warnIfBinMissingFromPath,
} from "../../../../apps/cli/src/core/store";

describe("getStoreRoot", () => {
  const originalCapsuleHome = process.env.CAPSULE_HOME;

  afterEach(() => {
    if (originalCapsuleHome === undefined) {
      delete process.env.CAPSULE_HOME;
    } else {
      process.env.CAPSULE_HOME = originalCapsuleHome;
    }
  });

  test("returns CAPSULE_HOME when set", () => {
    process.env.CAPSULE_HOME = "/custom/capsule";
    expect(getStoreRoot()).toBe("/custom/capsule");
  });

  test("strips trailing slashes from CAPSULE_HOME", () => {
    process.env.CAPSULE_HOME = "/custom/capsule/";
    expect(getStoreRoot()).toBe("/custom/capsule/");
  });
});

describe("path helpers", () => {
  const originalCapsuleHome = process.env.CAPSULE_HOME;

  beforeAll(() => {
    process.env.CAPSULE_HOME = "/tmp/test-capsule";
  });

  afterAll(() => {
    if (originalCapsuleHome === undefined) {
      delete process.env.CAPSULE_HOME;
    } else {
      process.env.CAPSULE_HOME = originalCapsuleHome;
    }
  });

  test("getAppsDir returns apps subdirectory", () => {
    expect(getAppsDir()).toBe("/tmp/test-capsule/apps");
  });

  test("getBinDir returns bin subdirectory", () => {
    expect(getBinDir()).toBe("/tmp/test-capsule/bin");
  });

  test("getCertificatePath returns certificate.json path", () => {
    expect(getCertificatePath()).toBe("/tmp/test-capsule/certificate.json");
  });

  test("getAppDir returns app subdirectory", () => {
    expect(getAppDir("my-app")).toBe("/tmp/test-capsule/apps/my-app");
  });
});

describe("getInvokedAppName", () => {
  const originalExecPath = process.execPath;
  const originalArgv0 = process.argv[0];

  afterEach(() => {
    Object.defineProperty(process, "execPath", { value: originalExecPath, configurable: true });
    process.argv[0] = originalArgv0;
  });

  test("returns undefined for 'capsule' binary", () => {
    Object.defineProperty(process, "execPath", { value: "/usr/local/bin/capsule", configurable: true });
    process.argv[0] = "/usr/local/bin/capsule";
    expect(getInvokedAppName()).toBeUndefined();
  });

  test("returns undefined for 'bun'", () => {
    Object.defineProperty(process, "execPath", { value: "/usr/local/bin/bun", configurable: true });
    process.argv[0] = "/usr/local/bin/bun";
    expect(getInvokedAppName()).toBeUndefined();
  });

  test("returns app name for linked shim", () => {
    Object.defineProperty(process, "execPath", { value: "/path/to/my-app", configurable: true });
    process.argv[0] = "/path/to/my-app";
    expect(getInvokedAppName()).toBe("my-app");
  });

  test("returns app name for exe on windows", () => {
    Object.defineProperty(process, "execPath", { value: "C:\\capsule\\bin\\my-app.exe", configurable: true });
    process.argv[0] = "C:\\capsule\\bin\\my-app.exe";
    expect(getInvokedAppName()).toBe("my-app.exe");
  });
});

describe("warnIfBinMissingFromPath", () => {
  const originalPath = process.env.PATH;
  const originalCapsuleHome = process.env.CAPSULE_HOME;

  afterEach(() => {
    process.env.PATH = originalPath;
    if (originalCapsuleHome === undefined) {
      delete process.env.CAPSULE_HOME;
    } else {
      process.env.CAPSULE_HOME = originalCapsuleHome;
    }
  });

  test("returns undefined when bin dir is in PATH", async () => {
    process.env.CAPSULE_HOME = "/tmp/test-capsule";
    process.env.PATH = "/usr/bin:/bin:/tmp/test-capsule/bin";
    expect(await warnIfBinMissingFromPath()).toBeUndefined();
  });

  test("returns bin dir when not in PATH", async () => {
    process.env.CAPSULE_HOME = "/tmp/test-capsule";
    process.env.PATH = "/usr/bin:/bin";
    expect(await warnIfBinMissingFromPath()).toBe("/tmp/test-capsule/bin");
  });
});
