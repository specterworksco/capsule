import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../apps/cli/src/cli";
import { getCertificatePath, saveCertificate } from "../apps/cli/src/core/store";
import { resolveReleaseAssetName } from "../apps/cli/src/core/upgrade";
import {
  createSignedCapsule,
  createTestEnv,
  publishToKeyring,
  publishToRegistry,
  requestCertificate,
  withTempHome,
  type TestEnv,
} from "./helpers";

describe("cli", () => {
  let env: TestEnv;
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.CAPSULE_GITHUB_API_URL;

  beforeEach(() => {
    env = createTestEnv();
    process.exitCode = undefined;
  });

  afterEach(() => {
    env.close();
    process.exitCode = undefined;
    globalThis.fetch = originalFetch;
    if (originalApiUrl === undefined) {
      delete process.env.CAPSULE_GITHUB_API_URL;
    } else {
      process.env.CAPSULE_GITHUB_API_URL = originalApiUrl;
    }
  });

  test("base command shows an update notice when a newer release exists", async () => {
    process.env.CAPSULE_GITHUB_API_URL = "http://github.test";
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input) === "http://github.test/repos/specterworksco/capsule/releases/latest") {
        return Promise.resolve(
          Response.json({
            tag_name: "v9.0.0",
            html_url: "http://github.test/release",
            assets: [{ name: resolveReleaseAssetName(), browser_download_url: "http://download.test/capsule" }],
          }),
        );
      }

      return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;

    const output = await captureConsole(() => runCli([]));

    expect(process.exitCode).toBeUndefined();
    expect(output).toContain("Capsule 9.0.0 is available");
    expect(output).toContain("capsule upgrade");
  });

  test("registry download saves direct URL archives without installing them", async () => {
    const bytes = new TextEncoder().encode("capsule-bytes");
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(bytes, { headers: { "content-type": "application/vnd.capsule.app" } }),
    });

    try {
      await withTempHome(async (home) => {
        const output = join(home, "downloads", "direct.capsule.app");
        await runCli(["registry", "download", `http://127.0.0.1:${server.port}/direct.capsule.app`, "--output", output]);

        expect(process.exitCode).toBeUndefined();
        expect(new Uint8Array(await readFile(output))).toEqual(bytes);
        expect(existsSync(join(home, ".capsule", "apps"))).toBe(false);
      });
    } finally {
      server.stop(true);
    }
  });

  test("whoami reports no local certificate without failing", async () => {
    await withTempHome(async () => {
      const output = await captureConsole(() => runCli(["whoami", "--keyring-server", env.keyringUrl]));

      expect(process.exitCode).toBeUndefined();
      expect(output).toContain("No local certificate found");
      expect(output).toContain("capsule certificate request");
    });
  });

  test("whoami validates and reports the local certificate identity", async () => {
    const certificate = await requestCertificate(env.keyringUrl, { name: "Who Am I", email: "whoami@example.com" });

    await withTempHome(async () => {
      await saveCertificate(certificate);
      const output = await captureConsole(() => runCli(["whoami", "--keyring-server", env.keyringUrl]));

      expect(process.exitCode).toBeUndefined();
      expect(output).toContain("Who Am I");
      expect(output).toContain("whoami@example.com");
      expect(output).toContain(certificate.certificateId);
      expect(output).toContain("Certificate is active");
    });
  });

  test("registry install resolves, verifies, and installs a published package", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "cli-install", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, certificate, capsule);

    await withTempHome(async (home) => {
      await runCli([
        "registry",
        "install",
        "cli-install",
        "--keyring-server",
        env.keyringUrl,
        "--registry-server",
        env.registryUrl,
      ]);

      expect(process.exitCode).toBeUndefined();
      const appDir = join(home, ".capsule", "apps", "cli-install");
      expect(existsSync(join(appDir, "manifest.json"))).toBe(true);
      expect(existsSync(join(appDir, "bundle.js"))).toBe(true);
      expect(existsSync(join(home, ".capsule", "bin", "cli-install"))).toBe(true);
    });
  });

  test("certificate revoke transfers owned packages, revokes remotely, and deletes local certificate", async () => {
    const owner = await requestCertificate(env.keyringUrl);
    const replacement = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(owner, { name: "cli-revoke", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, owner, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, owner, capsule);

    await withTempHome(async () => {
      await saveCertificate(owner);
      expect(existsSync(getCertificatePath())).toBe(true);

      await runCli([
        "certificate",
        "revoke",
        "--transfer-to",
        replacement.certificateId,
        "--keyring-server",
        env.keyringUrl,
        "--registry-server",
        env.registryUrl,
      ]);

      expect(process.exitCode).toBeUndefined();
      expect(existsSync(getCertificatePath())).toBe(false);

      const info = await (await fetch(`${env.registryUrl}/apps/cli-revoke`)).json();
      expect(info.certificateId).toBe(replacement.certificateId);
      expect(info.author).toEqual(replacement.author);

      const oldOwner = await (await fetch(`${env.registryUrl}/owners/${owner.certificateId}/apps`)).json();
      const newOwner = await (await fetch(`${env.registryUrl}/owners/${replacement.certificateId}/apps`)).json();
      expect(oldOwner.packages).toEqual([]);
      expect(newOwner.packages).toEqual(["cli-revoke"]);

      const certificateRecord = await (await fetch(`${env.keyringUrl}/certificates/${owner.certificateId}`)).json();
      expect(certificateRecord.revokedAt).toBeString();
      expect(certificateRecord.replacedByCertificateId).toBe(replacement.certificateId);
    });
  });
});

async function captureConsole(run: () => Promise<void>): Promise<string> {
  const messages: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));

  try {
    await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return messages.join("\n");
}
