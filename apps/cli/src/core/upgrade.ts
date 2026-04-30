import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { platform, arch } from "node:os";
import { getBinDir } from "./store";

const DEFAULT_REPO = "specterworksco/capsule";

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GithubRelease = {
  tag_name: string;
  html_url?: string;
  assets: ReleaseAsset[];
};

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  releaseUrl?: string;
  asset: ReleaseAsset;
};

export function resolveReleaseAssetName(options: { target?: string; variant?: string } = {}): string {
  if (options.target) {
    const asset = assetFromTarget(options.target);
    if (!asset) {
      throw new Error(`Unsupported upgrade target: ${options.target}`);
    }

    return asset;
  }

  const os = platform();
  const cpu = arch();
  const variant = (options.variant ?? process.env.CAPSULE_INSTALL_VARIANT ?? "default").toLowerCase();

  if (os === "darwin") {
    if (cpu === "x64") {
      return variant === "baseline" ? "capsule-macos-x64-baseline" : assertVariant(variant, "default", "capsule-macos-x64");
    }

    if (cpu === "arm64") {
      return assertVariant(variant, "default", "capsule-macos-arm64");
    }
  }

  if (os === "linux") {
    if (cpu === "x64") {
      if (variant === "baseline") return "capsule-linux-x64-baseline";
      if (variant === "modern") return "capsule-linux-x64-modern";
      if (variant === "musl") return "capsule-linux-x64-musl";
      return assertVariant(variant, "default", "capsule-linux-x64");
    }

    if (cpu === "arm64") {
      if (variant === "musl") return "capsule-linux-arm64-musl";
      return assertVariant(variant, "default", "capsule-linux-arm64");
    }
  }

  if (os === "win32") {
    if (cpu === "x64") {
      if (variant === "baseline") return "capsule-windows-x64-baseline.exe";
      if (variant === "modern") return "capsule-windows-x64-modern.exe";
      return assertVariant(variant, "default", "capsule-windows-x64.exe");
    }

    if (cpu === "arm64") {
      return assertVariant(variant, "default", "capsule-windows-arm64.exe");
    }
  }

  throw new Error(`Unsupported platform: ${os}-${cpu}`);
}

export async function getLatestRelease(repo = process.env.CAPSULE_UPGRADE_REPO ?? DEFAULT_REPO): Promise<GithubRelease> {
  const apiBase = (process.env.CAPSULE_GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
  const response = await fetch(`${apiBase}/repos/${repo}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "capsule-cli",
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`GitHub release lookup failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as GithubRelease;
  if (!data.tag_name || !Array.isArray(data.assets)) {
    throw new Error("GitHub release response is missing tag_name or assets.");
  }

  return data;
}

export async function checkForUpdate(currentVersion: string, options: { target?: string; variant?: string } = {}): Promise<UpdateInfo | undefined> {
  const release = await getLatestRelease();
  const latestVersion = normalizeVersion(release.tag_name);
  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return undefined;
  }

  const assetName = resolveReleaseAssetName(options);
  const asset = release.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} does not include asset ${assetName}.`);
  }

  return {
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url,
    asset,
  };
}

export async function upgradeCapsule(options: {
  currentVersion: string;
  target?: string;
  variant?: string;
  installDir?: string;
  force?: boolean;
}): Promise<{ updated: boolean; version: string; destination: string; assetName?: string }> {
  const update = await checkForUpdate(options.currentVersion, { target: options.target, variant: options.variant });
  const assetName = update?.asset.name ?? resolveReleaseAssetName({ target: options.target, variant: options.variant });
  const destination = getDestinationPath(options.installDir);

  if (!update && !options.force) {
    return { updated: false, version: options.currentVersion, destination, assetName };
  }

  const release = update ?? (await forcedRelease(options.currentVersion, assetName));
  const bytes = await downloadAsset(release.asset.browser_download_url);
  await installBytes(destination, bytes);

  return { updated: true, version: release.latestVersion, destination, assetName: release.asset.name };
}

async function forcedRelease(currentVersion: string, assetName: string): Promise<UpdateInfo> {
  const release = await getLatestRelease();
  const asset = release.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} does not include asset ${assetName}.`);
  }

  return {
    currentVersion,
    latestVersion: normalizeVersion(release.tag_name),
    releaseUrl: release.html_url,
    asset,
  };
}

async function downloadAsset(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function installBytes(destination: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, bytes, { mode: 0o755 });
  await chmod(temporary, 0o755).catch(() => undefined);

  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function getDestinationPath(installDir?: string): string {
  const binary = platform() === "win32" ? "capsule.exe" : "capsule";
  return join(installDir ?? process.env.CAPSULE_INSTALL_DIR ?? getBinDir(), binary);
}

function assetFromTarget(target: string): string | undefined {
  const assets: Record<string, string> = {
    "bun-darwin-x64": "capsule-macos-x64",
    "bun-darwin-x64-baseline": "capsule-macos-x64-baseline",
    "bun-darwin-arm64": "capsule-macos-arm64",
    "bun-linux-x64": "capsule-linux-x64",
    "bun-linux-x64-baseline": "capsule-linux-x64-baseline",
    "bun-linux-x64-modern": "capsule-linux-x64-modern",
    "bun-linux-arm64": "capsule-linux-arm64",
    "bun-linux-x64-musl": "capsule-linux-x64-musl",
    "bun-linux-arm64-musl": "capsule-linux-arm64-musl",
    "bun-windows-x64": "capsule-windows-x64.exe",
    "bun-windows-x64-baseline": "capsule-windows-x64-baseline.exe",
    "bun-windows-x64-modern": "capsule-windows-x64-modern.exe",
    "bun-windows-arm64": "capsule-windows-arm64.exe",
  };

  return assets[target];
}

function assertVariant(actual: string, expected: string, asset: string): string {
  if (actual !== expected) {
    throw new Error(`Unsupported upgrade variant '${actual}' for this platform.`);
  }

  return asset;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}
