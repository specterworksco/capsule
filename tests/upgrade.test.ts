import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate, compareVersions, resolveReleaseAssetName, upgradeCapsule } from "../apps/cli/src/core/upgrade";

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.CAPSULE_GITHUB_API_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) {
    delete process.env.CAPSULE_GITHUB_API_URL;
  } else {
    process.env.CAPSULE_GITHUB_API_URL = originalApiUrl;
  }
});

describe("upgrade helpers", () => {
  test("compares semver-like release versions", () => {
    expect(compareVersions("2.2.0", "2.1.9")).toBe(1);
    expect(compareVersions("v2.1.0", "2.1.0")).toBe(0);
    expect(compareVersions("2.0.9", "2.1.0")).toBe(-1);
  });

  test("maps explicit Bun targets to published release assets", () => {
    expect(resolveReleaseAssetName({ target: "bun-linux-x64-modern" })).toBe("capsule-linux-x64-modern");
    expect(resolveReleaseAssetName({ target: "bun-windows-arm64" })).toBe("capsule-windows-arm64.exe");
    expect(resolveReleaseAssetName({ target: "bun-darwin-x64-baseline" })).toBe("capsule-macos-x64-baseline");
  });

  test("detects available updates from the GitHub release API", async () => {
    mockReleaseApi({ tag_name: "v9.0.0", assets: [{ name: resolveReleaseAssetName(), browser_download_url: "http://download.test/capsule" }] });

    const update = await checkForUpdate("2.1.0");

    expect(update?.latestVersion).toBe("9.0.0");
    expect(update?.asset.name).toBe(resolveReleaseAssetName());
  });

  test("installs latest release bytes into the requested directory", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "capsule-upgrade-"));
    const assetName = resolveReleaseAssetName();
    const bytes = new TextEncoder().encode("new capsule binary");
    mockReleaseApi({ tag_name: "v9.0.0", assets: [{ name: assetName, browser_download_url: "http://download.test/capsule" }] }, bytes);

    try {
      const result = await upgradeCapsule({ currentVersion: "2.1.0", installDir });
      const destination = join(installDir, process.platform === "win32" ? "capsule.exe" : "capsule");

      expect(result.updated).toBe(true);
      expect(result.version).toBe("9.0.0");
      expect(result.destination).toBe(destination);
      expect(existsSync(destination)).toBe(true);
      expect(await readFile(destination, "utf8")).toBe("new capsule binary");
    } finally {
      await rm(installDir, { recursive: true, force: true });
    }
  });
});

function mockReleaseApi(release: { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }, bytes?: Uint8Array) {
  process.env.CAPSULE_GITHUB_API_URL = "http://github.test";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "http://github.test/repos/specterworksco/capsule/releases/latest") {
      return Promise.resolve(Response.json({ ...release, html_url: "http://github.test/release" }));
    }

    if (url === "http://download.test/capsule") {
      return Promise.resolve(new Response(bytes ?? new Uint8Array([1, 2, 3])));
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
}
