#!/usr/bin/env bun
/**
 * Capsule Installer
 *
 * Universal cross-platform installer for Capsule CLI.
 * Compiles to a standalone binary via `bun build --compile`.
 *
 * Usage:
 *   capsule-installer                # interactive (defaults)
 *   capsule-installer --yes          # non-interactive, accept defaults
 *   capsule-installer --target bun-linux-x64   # override target
 *   capsule-installer --dir /custom/path       # custom install dir
 *   capsule-installer --variant baseline       # variant override
 *   capsule-installer --version v2.2.0         # specific version
 *
 * Environment variables (overridden by CLI flags):
 *   CAPSULE_INSTALL_DIR     Install directory (default: ~/.capsule/bin)
 *   CAPSULE_INSTALL_TARGET  Override target triple (e.g. bun-linux-x64)
 *   CAPSULE_INSTALL_VARIANT CPU variant (default, baseline, modern, musl)
 *   CAPSULE_VERSION         Specific version to install (default: latest)
 *   CAPSULE_REPO            GitHub repo (default: specterworksco/capsule)
 */

import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_REPO = "specterworksco/capsule";
const GITHUB_API = "https://api.github.com";
const SHELL_PROFILE_FILES = [".profile", ".bashrc", ".bash_profile", ".zshrc"];

// ─── Types ───────────────────────────────────────────────────────────────

interface InstallOptions {
  repo: string;
  version: string | null; // null = latest
  target: string | null; // null = auto-detect
  variant: string;
  installDir: string;
  yes: boolean;
}

interface PlatformInfo {
  os: "linux" | "macos" | "windows";
  arch: "x64" | "arm64";
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isMusl(): boolean {
  try {
    const ldd = Bun.spawnSync(["ldd", "--version"]);
    if (ldd.stdout.toString().toLowerCase().includes("musl")) return true;
  } catch {
    // fall through
  }
  try {
    return existsSync("/lib/ld-musl-x86_64.so.1") || existsSync("/lib/ld-musl-aarch64.so.1");
  } catch {
    return false;
  }
}

function detectPlatform(variant: string): PlatformInfo & { variant: string } {
  const osRaw = platform();

  let os: PlatformInfo["os"];
  if (osRaw === "darwin") os = "macos";
  else if (osRaw === "linux") os = "linux";
  else if (osRaw === "win32") os = "windows";
  else throw new Error(`Unsupported platform: ${osRaw}`);

  // Detect arch from Bun's builtin (more reliable than node's)
  let arch: PlatformInfo["arch"];
  const archRaw = process.arch;
  if (archRaw === "x64") arch = "x64";
  else if (archRaw === "arm64") arch = "arm64";
  else throw new Error(`Unsupported architecture: ${archRaw}`);

  return { os, arch, variant };
}

function resolveAssetName(platform: { os: string; arch: string; variant: string }, targetOverride: string | null): string {
  if (targetOverride) {
    const name = assetFromTarget(targetOverride);
    if (!name) throw new Error(`Unsupported target override: ${targetOverride}`);
    return name;
  }

  const { os, arch, variant } = platform;

  if (os === "windows") {
    switch (`${arch}:${variant}`) {
      case "x64:default": return "capsule-windows-x64.exe";
      case "x64:baseline": return "capsule-windows-x64-baseline.exe";
      case "x64:modern": return "capsule-windows-x64-modern.exe";
      case "arm64:default": return "capsule-windows-arm64.exe";
      default: throw new Error(`Unsupported variant '${variant}' for windows-${arch}`);
    }
  }

  if (os === "macos") {
    switch (`${arch}:${variant}`) {
      case "x64:default": return "capsule-macos-x64";
      case "x64:baseline": return "capsule-macos-x64-baseline";
      case "arm64:default": return "capsule-macos-arm64";
      default: throw new Error(`Unsupported variant '${variant}' for macos-${arch}`);
    }
  }

  // Linux
  const useMusl = variant === "musl" || (variant === "default" && isMusl());
  switch (`${arch}:${useMusl ? "musl" : variant}`) {
    case "x64:default": return "capsule-linux-x64";
    case "x64:baseline": return "capsule-linux-x64-baseline";
    case "x64:modern": return "capsule-linux-x64-modern";
    case "x64:musl": return "capsule-linux-x64-musl";
    case "arm64:default": return "capsule-linux-arm64";
    case "arm64:musl": return "capsule-linux-arm64-musl";
    default: throw new Error(`Unsupported variant '${variant}' for linux-${arch}`);
  }
}

function assetFromTarget(target: string): string | null {
  const map: Record<string, string> = {
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
  return map[target] ?? null;
}

function binaryName(assetName: string): string {
  return assetName.endsWith(".exe") ? "capsule.exe" : "capsule";
}

// ─── HTTP helpers with retry ─────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;

      // Rate limit or server error — retry
      if (response.status === 429 || response.status >= 500) {
        const delay = attempt * 1000;
        console.error(`  ⚠ HTTP ${response.status}, retrying in ${delay}ms... (${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }

      // Client error — don't retry
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = attempt * 1500;
        console.error(`  ⚠ Network error, retrying in ${delay}ms... (${attempt}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("Failed after max retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── GitHub API ──────────────────────────────────────────────────────────

async function getLatestVersion(repo: string): Promise<string> {
  const url = `${GITHUB_API}/repos/${repo}/releases/latest`;
  const response = await fetchWithRetry(url);
  const data = await response.json() as { tag_name?: string };
  if (!data.tag_name) throw new Error("Could not determine latest release version");
  return data.tag_name;
}

async function getDownloadUrl(repo: string, version: string, asset: string): Promise<string> {
  if (version === "latest") {
    // Use the redirect-less URL for the release asset
    return `https://github.com/${repo}/releases/latest/download/${asset}`;
  }
  return `https://github.com/${repo}/releases/download/${version}/${asset}`;
}

// ─── Install logic ───────────────────────────────────────────────────────

function resolveInstallDir(userDir: string | undefined): string {
  if (userDir) return resolve(userDir);
  if (platform() === "win32") {
    const userProfile = process.env.USERPROFILE ?? homedir();
    return join(userProfile, ".capsule", "bin");
  }
  return join(homedir(), ".capsule", "bin");
}

function showProgress(current: number, total: number): void {
  const pct = Math.min(Math.round((current / total) * 100), 100);
  const barWidth = 30;
  const filled = Math.min(Math.round((current / total) * barWidth), barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  process.stderr.write(`\r  Downloading [${bar}] ${pct}%`);
  if (current >= total) process.stderr.write("\n");
}

async function downloadWithProgress(url: string, destPath: string): Promise<void> {
  const response = await fetchWithRetry(url);
  const total = parseInt(response.headers.get("content-length") ?? "0", 10);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) showProgress(received, total);
    }
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const buf = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }

  if (total > 0 && buf.length !== total) {
    throw new Error(`Download size mismatch: expected ${total} bytes, got ${buf.length}`);
  }

  if (buf.length === 0) {
    throw new Error("Downloaded file is empty");
  }

  await writeFile(destPath, buf);
}

// ─── PATH setup ──────────────────────────────────────────────────────────

async function addPathToShellProfile(installDir: string): Promise<void> {
  if (platform() === "win32") {
    addPathToWindows(installDir);
    return;
  }

  const home = homedir();
  const pathLine = `\n# Capsule PATH\nexport PATH="${installDir}:$PATH"\n`;
  const guardLine = `# Capsule PATH`;

  for (const file of SHELL_PROFILE_FILES) {
    const filePath = join(home, file);
    try {
      if (!existsSync(filePath)) {
        await writeFile(filePath, pathLine.trimStart());
        console.log(`  ✓ Created ${file} with Capsule PATH entry`);
        continue;
      }

      const existing = await Bun.file(filePath).text();
      if (existing.includes(guardLine)) {
        console.log(`  ✓ Capsule PATH already in ${file}`);
        continue;
      }

      await writeFile(filePath, existing + pathLine);
      console.log(`  ✓ Added Capsule PATH to ${file}`);
    } catch (err) {
      console.error(`  ⚠ Could not update ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

function addPathToWindows(installDir: string): void {
  // On Windows, we update the User PATH environment variable
  try {
    const result = Bun.spawnSync([
      "powershell.exe", "-NoProfile", "-Command",
      `$path = [Environment]::GetEnvironmentVariable("Path", "User");
       $entries = @($path -split ";" | Where-Object { $_ });
       if ($entries -notcontains "${installDir}") {
         $newPath = @("${installDir}") + $entries -join ";";
         [Environment]::SetEnvironmentVariable("Path", $newPath, "User");
         Write-Host "Added Capsule to User PATH";
       } else {
         Write-Host "Capsule already in User PATH";
       }`,
    ]);
    const output = result.stdout.toString().trim();
    if (output) console.log(`  ✓ ${output}`);
  } catch (err) {
    console.error(`  ⚠ Could not update PATH: ${err instanceof Error ? err.message : err}`);
    console.log(`  ℹ Add "${installDir}" to your PATH manually.`);
  }
}

// ─── CLI parsing ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): InstallOptions {
  const options: InstallOptions = {
    repo: process.env.CAPSULE_REPO ?? DEFAULT_REPO,
    version: process.env.CAPSULE_VERSION ?? null,
    target: process.env.CAPSULE_INSTALL_TARGET ?? null,
    variant: process.env.CAPSULE_INSTALL_VARIANT ?? "default",
    installDir: resolveInstallDir(process.env.CAPSULE_INSTALL_DIR),
    yes: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--yes":
      case "-y":
        options.yes = true;
        break;
      case "--target":
      case "-t":
        options.target = argv[++i];
        if (!options.target) throw new Error("--target requires a value (e.g. bun-linux-x64)");
        break;
      case "--dir":
      case "-d":
        options.installDir = resolve(argv[++i] ?? "");
        if (!options.installDir) throw new Error("--dir requires a path");
        break;
      case "--variant":
      case "-v":
        options.variant = argv[++i]?.toLowerCase() ?? "default";
        if (!["default", "baseline", "modern", "musl"].includes(options.variant)) {
          throw new Error(`Invalid variant '${options.variant}'. Use: default, baseline, modern, musl`);
        }
        break;
      case "--version":
      case "-V":
        options.version = argv[++i];
        if (!options.version) throw new Error("--version requires a value (e.g. v2.2.0)");
        break;
      case "--repo":
      case "-r":
        options.repo = argv[++i];
        if (!options.repo) throw new Error("--repo requires a value (e.g. owner/repo)");
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Capsule Installer — install the Capsule CLI

Usage:
  capsule-installer [options]

Options:
  --yes, -y           Non-interactive, accept all defaults
  --target, -t <triple>  Override target triple (e.g. bun-linux-x64)
  --dir, -d <path>    Custom install directory
  --variant, -v <name>  CPU variant: default, baseline, modern, musl
  --version, -V <tag>   Specific version to install (e.g. v2.2.0)
  --repo, -r <owner/repo>  GitHub repository (default: specterworksco/capsule)
  --help, -h          Show this help

Environment variables:
  CAPSULE_INSTALL_DIR     Install directory (default: ~/.capsule/bin)
  CAPSULE_INSTALL_TARGET  Override target triple
  CAPSULE_INSTALL_VARIANT CPU variant (default, baseline, modern, musl)
  CAPSULE_VERSION         Specific version to install
  CAPSULE_REPO            GitHub repository
`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("  ╔══════════════════════════════╗");
  console.log("  ║    Capsule Installer v2      ║");
  console.log("  ╚══════════════════════════════╝");
  console.log("");

  const opts = parseArgs(Bun.argv);

  // Detect platform
  const platformInfo = detectPlatform(opts.variant);
  console.log(`  ℹ Platform: ${platformInfo.os}-${platformInfo.arch} (${platformInfo.variant})`);

  // Resolve version
  const version = opts.version ?? "latest";
  if (version === "latest") {
    console.log(`  ℹ Resolving latest release...`);
    const latest = await getLatestVersion(opts.repo);
    console.log(`  ✓ Latest release: ${latest}`);
    opts.version = latest;
  } else {
    console.log(`  ℹ Using specified version: ${version}`);
    opts.version = version;
  }

  // Resolve asset name
  const assetName = resolveAssetName(platformInfo, opts.target);
  const installDir = opts.installDir;
  const destPath = join(installDir, binaryName(assetName));

  console.log(`  ℹ Asset: ${assetName}`);
  console.log(`  ℹ Install to: ${destPath}`);

  // Confirm
  if (!opts.yes) {
    console.log("");
    console.log(`  This will install Capsule to:`);
    console.log(`    ${installDir}`);
    console.log(`  And add it to your PATH.`);
    console.log("");
    // Non-interactive by default; if run without --yes in interactive terminal,
    // give a buffer to cancel
    await sleep(500);
  }

  // Create install directory
  try {
    mkdirSync(installDir, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create install directory ${installDir}: ${err instanceof Error ? err.message : err}`);
  }

  // Download
  const downloadUrl = await getDownloadUrl(opts.repo, opts.version, assetName);
  console.log(`  ↓ Downloading from GitHub...`);

  try {
    await downloadWithProgress(downloadUrl, destPath);
    console.log(`  ✓ Downloaded ${assetName}`);
  } catch (err) {
    // Clean up partial download
    try { await unlink(destPath); } catch { /* ignore */ }
    throw new Error(`Download failed: ${err instanceof Error ? err.message : err}`);
  }

  // Make executable (Unix only)
  if (platform() !== "win32") {
    try {
      chmodSync(destPath, 0o755);
    } catch (err) {
      throw new Error(`Failed to set executable permission: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Set up PATH
  console.log(`  🔧 Setting up PATH...`);
  await addPathToShellProfile(installDir);

  // Verify
  await sleep(100);
  const stat = existsSync(destPath)
    ? { size: Bun.spawnSync(["stat", "--printf=%s", destPath]).stdout.toString().trim() }
    : null;

  // Verify it's a valid executable
  const verifyResult = Bun.spawnSync([destPath, "--version"], { env: { ...process.env, CAPSULE_INSTALL_DIR: installDir, PATH: `${installDir}:${process.env.PATH ?? ""}` } });
  const versionCheck = verifyResult.exitCode === 0
    ? verifyResult.stdout.toString().trim().split("\n")[0]
    : null;

  console.log("");
  console.log(`  ╔══════════════════════════════╗`);
  console.log(`  ║     Installation Complete    ║`);
  console.log(`  ╚══════════════════════════════╝`);
  console.log("");
  console.log(`  📍 Location: ${destPath}`);
  if (stat) console.log(`  📦 Size: ${(parseInt(stat.size) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  🏷️  Asset: ${assetName}`);
  console.log(`  🔖 Version: ${opts.version}`);
  if (versionCheck) console.log(`  ✅ Verify: ${versionCheck}`);

  if (platform() === "win32") {
    console.log(`  ℹ Capsule added to your User PATH. Restart your terminal or run:`);
    console.log(`     $refreshenv`);
  } else {
    console.log(`  ℹ Capsule added to your PATH in shell profile files.`);
    console.log(`  ℹ Restart your shell or run: source ~/.profile`);
  }
  console.log(`  ℹ Run 'capsule' to get started.`);
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
  console.error("");
  process.exit(1);
});
