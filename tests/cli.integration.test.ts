import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../apps/cli/src/cli";
import { getAppsDir, getBinDir, getCertificatePath, saveCertificate } from "../apps/cli/src/core/store";
import { getSecretsForApp } from "../apps/cli/src/core/secrets";
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

  test("list reports no apps when empty, then shows installed app, and uninstall removes it", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "list-test-app", version: "1.0.0", description: "List test", author: "Tester" });

    await withTempHome(async () => {
      const emptyOutput = await captureConsole(() => runCli(["list"]));
      expect(emptyOutput).toContain("No apps installed");

      await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);
      await publishToRegistry(env.registryUrl, certificate, capsule);
      await runCli(["registry", "install", "list-test-app", "--keyring-server", env.keyringUrl, "--registry-server", env.registryUrl]);
      expect(process.exitCode).toBeUndefined();

      const listOutput = await captureConsole(() => runCli(["list"]));
      expect(listOutput).toContain("list-test-app");
      expect(listOutput).toContain("1.0.0");
      expect(listOutput).toContain("List test");

      const uninstallOutput = await captureConsole(() => runCli(["uninstall", "list-test-app"]));
      expect(uninstallOutput).toContain("Uninstalled list-test-app");
      expect(process.exitCode).toBeUndefined();
      expect(existsSync(join(getAppsDir(), "list-test-app"))).toBe(false);
      expect(existsSync(join(getBinDir(), "list-test-app"))).toBe(false);

      const finalOutput = await captureConsole(() => runCli(["list"]));
      expect(finalOutput).toContain("No apps installed");
    });
  });

  test("update downloads and installs a newer version", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsuleV1 = await createSignedCapsule(certificate, { name: "update-test-app", version: "1.0.0" });
    const capsuleV2 = await createSignedCapsule(certificate, { name: "update-test-app", version: "2.0.0" });

    await publishToKeyring(env.keyringUrl, certificate, capsuleV1.contentHash, capsuleV1.signature);
    await publishToKeyring(env.keyringUrl, certificate, capsuleV2.contentHash, capsuleV2.signature);
    await publishToRegistry(env.registryUrl, certificate, capsuleV1);

    await withTempHome(async () => {
      await runCli(["registry", "install", "update-test-app", "--keyring-server", env.keyringUrl, "--registry-server", env.registryUrl]);
      expect(process.exitCode).toBeUndefined();

      const appDir = join(getAppsDir(), "update-test-app");
      const manifestV1 = JSON.parse(await readFile(join(appDir, "manifest.json"), "utf8"));
      expect(manifestV1.version).toBe("1.0.0");

      await publishToRegistry(env.registryUrl, certificate, capsuleV2);

      await runCli(["update", "update-test-app", "--keyring-server", env.keyringUrl, "--registry-server", env.registryUrl]);
      expect(process.exitCode).toBeUndefined();

      const manifestV2 = JSON.parse(await readFile(join(appDir, "manifest.json"), "utf8"));
      expect(manifestV2.version).toBe("2.0.0");
    });
  });

  test("install with --alias creates a custom binary name", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "alias-original", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, certificate, capsule);

    await withTempHome(async () => {
      await runCli([
        "registry", "install", "alias-original",
        "--alias", "my-custom-name",
        "--keyring-server", env.keyringUrl,
        "--registry-server", env.registryUrl,
      ]);
      expect(process.exitCode).toBeUndefined();
      expect(existsSync(join(getBinDir(), "my-custom-name"))).toBe(true);
      expect(existsSync(join(getBinDir(), "alias-original"))).toBe(false);
      expect(existsSync(join(getAppsDir(), "alias-original"))).toBe(true);
    });
  });

  test("secret set, list, and remove manage per-app environment secrets", async () => {
    const certificate = await requestCertificate(env.keyringUrl);
    const capsule = await createSignedCapsule(certificate, { name: "secret-test-app", version: "1.0.0" });
    await publishToKeyring(env.keyringUrl, certificate, capsule.contentHash, capsule.signature);
    await publishToRegistry(env.registryUrl, certificate, capsule);

    await withTempHome(async () => {
      await runCli(["registry", "install", "secret-test-app", "--keyring-server", env.keyringUrl, "--registry-server", env.registryUrl]);

      await runCli(["secret", "set", "secret-test-app", "MY_SECRET=my-value"]);
      expect(process.exitCode).toBeUndefined();

      const secrets = await getSecretsForApp("secret-test-app");
      expect(secrets).toEqual({ MY_SECRET: "my-value" });

      const listOutput = await captureConsole(() => runCli(["secret", "list", "secret-test-app"]));
      expect(listOutput).toContain("MY_SECRET");
      expect(listOutput).not.toContain("my-value");

      await runCli(["secret", "remove", "secret-test-app", "MY_SECRET"]);
      expect(process.exitCode).toBeUndefined();

      const secretsAfter = await getSecretsForApp("secret-test-app");
      expect(secretsAfter).toEqual({});
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
