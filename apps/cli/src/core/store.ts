import { constants, existsSync } from "node:fs";
import { access, chmod, link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { CertificateResponseSchema, type CertificateResponse, type Manifest } from "@capsule/shared";
import type { InstalledApp } from "../types";
import { readCapsuleArchive } from "./archive";

export function getStoreRoot(): string {
  if (platform() === "win32") {
    return process.env.APPDATA ? join(process.env.APPDATA, "capsule") : join(homedir(), "AppData", "Roaming", "capsule");
  }

  return join(homedir(), ".capsule");
}

export function getAppsDir(): string {
  return join(getStoreRoot(), "apps");
}

export function getBinDir(): string {
  return join(getStoreRoot(), "bin");
}

export function getCertificatePath(): string {
  return join(getStoreRoot(), "certificate.json");
}

export function getAppDir(name: string): string {
  return join(getAppsDir(), name);
}

export async function installCapsuleArchive(bytes: Uint8Array): Promise<InstalledApp> {
  const archive = readCapsuleArchive(bytes);
  const appDir = getAppDir(archive.manifest.name);

  await mkdir(appDir, { recursive: true });

  for (const [name, content] of Object.entries(archive.files)) {
    await writeFile(join(appDir, name), content);
  }

  await writeFile(join(appDir, "manifest.json"), JSON.stringify(archive.manifest, null, 2));
  await createShim(archive.manifest);

  return {
    manifest: archive.manifest,
    appDir,
    bundlePath: join(appDir, archive.manifest.entry),
  };
}

export async function loadCertificate(): Promise<CertificateResponse | undefined> {
  const certificatePath = getCertificatePath();

  if (!existsSync(certificatePath)) {
    return undefined;
  }

  return CertificateResponseSchema.parse(JSON.parse(await readFile(certificatePath, "utf8")));
}

export async function saveCertificate(certificate: CertificateResponse): Promise<string> {
  const certificatePath = getCertificatePath();
  await mkdir(dirname(certificatePath), { recursive: true });
  await writeFile(certificatePath, JSON.stringify(certificate, null, 2), { mode: 0o600 });
  await chmod(certificatePath, 0o600).catch(() => undefined);

  return certificatePath;
}

export async function getInstalledApp(name: string): Promise<InstalledApp | undefined> {
  const appDir = getAppDir(name);
  const manifestPath = join(appDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    return undefined;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  return {
    manifest,
    appDir,
    bundlePath: join(appDir, manifest.entry),
  };
}

export function getInvokedAppName(): string | undefined {
  const invoked = process.execPath && !isBunExecutable(process.execPath) ? process.execPath : process.argv[0];
  if (!invoked) {
    return undefined;
  }

  const base = invoked.split(/[\\/]/).pop();
  if (!base || base === "capsule" || base === "capsule.exe" || base === "bun") {
    return undefined;
  }

  return base.endsWith(".cmd") ? base.slice(0, -4) : base;
}

export async function warnIfBinMissingFromPath(): Promise<string | undefined> {
  const binDir = getBinDir();
  const pathEntries = (process.env.PATH ?? "").split(platform() === "win32" ? ";" : ":");
  const isPresent = pathEntries.some((entry) => resolve(entry) === resolve(binDir));
  return isPresent ? undefined : binDir;
}

async function createShim(manifest: Manifest): Promise<void> {
  await mkdir(getBinDir(), { recursive: true });

  if (platform() === "win32") {
    await createWindowsShim(manifest);
    return;
  }

  await createUnixShim(manifest);
}

async function createUnixShim(manifest: Manifest): Promise<void> {
  const shimPath = join(getBinDir(), manifest.name);
  const capsule = getCapsuleBinaryPath();
  await removeIfExists(shimPath);

  try {
    await link(capsule, shimPath);
    await chmod(shimPath, 0o755);
  } catch {
    const bundle = join(getAppDir(manifest.name), manifest.entry);
    await writeFile(shimPath, `#!/usr/bin/env sh\nexec "${capsule}" __run "${bundle}" "$@"\n`);
    await chmod(shimPath, 0o755);
  }
}

async function createWindowsShim(manifest: Manifest): Promise<void> {
  const shimPath = join(getBinDir(), `${manifest.name}.cmd`);
  const capsule = getCapsuleBinaryPath();
  const bundle = join(getAppDir(manifest.name), manifest.entry);
  const content = `@echo off\r\n"${capsule}" __run "${bundle}" %*\r\n`;
  await writeFile(shimPath, content);
}

function getCapsuleBinaryPath(): string {
  if (process.execPath && !isBunExecutable(process.execPath) && existsSync(process.execPath)) {
    return resolve(process.execPath);
  }

  if (process.argv[0] && !isBunExecutable(process.argv[0]) && existsSync(process.argv[0])) {
    return resolve(process.argv[0]);
  }

  if (process.argv[1] && existsSync(process.argv[1])) {
    return resolve(process.argv[1]);
  }

  try {
    const path = fileURLToPath(import.meta.url);
    return resolve(dirname(path), "..", "index.ts");
  } catch {
    return "capsule";
  }
}

function isBunExecutable(path: string): boolean {
  const base = path.split(/[\\/]/).pop();
  return base === "bun" || base === "bun.exe";
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
    await chmod(path, 0o755).catch(() => undefined);
    await unlink(path);
  } catch {
    // Nothing to remove.
  }
}
