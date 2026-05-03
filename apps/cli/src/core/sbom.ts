import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";

export interface SBOMEntry {
  /** Package name (e.g., "chalk") */
  name: string;
  /** Package version (e.g., "5.3.0") */
  version: string;
  /** Package manager used (e.g., "npm", "bun") */
  type: "npm" | "bun";
  /** SPDX identifier for the license, if known */
  license?: string;
}

export interface SBOM {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  version: number;
  metadata: {
    timestamp: string;
    tools: { name: string; version: string }[];
  };
  components: {
    type: "library";
    name: string;
    version: string;
    "bom-ref": string;
    licenses?: { license: { id: string } }[];
  }[];
}

/**
 * Generate an SBOM (CycloneDX) for the project at the given working directory.
 */
export async function generateSBOM(cwd: string): Promise<SBOM | null> {
  // Try reading lockfiles to extract dependencies
  const dependencies = await extractDependencies(cwd);
  if (!dependencies || dependencies.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const components = dependencies.map((dep) => ({
    type: "library" as const,
    name: dep.name,
    version: dep.version,
    "bom-ref": `pkg:npm/${dep.name}@${dep.version}`,
    ...(dep.license ? { licenses: [{ license: { id: dep.license } }] } : {}),
  }));

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: now,
      tools: [{ name: "capsule", version: "2.3.0" }],
    },
    components,
  };
}

interface DepEntry {
  name: string;
  version: string;
  type: "npm" | "bun";
  license?: string;
}

async function extractDependencies(cwd: string): Promise<DepEntry[]> {
  // Try bun.lockb first (Bun binary format)
  const bunLockPath = join(cwd, "bun.lockb");
  const pkgLockPath = join(cwd, "package-lock.json");
  const yarnLockPath = join(cwd, "yarn.lock");
  const pnpmLockPath = join(cwd, "pnpm-lock.yaml");

  // Try package-lock.json
  if (existsSync(pkgLockPath)) {
    return extractFromNPMLock(pkgLockPath);
  }

  // Fall back to reading package.json dependencies
  return extractFromPackageJson(cwd);
}

async function extractFromNPMLock(lockPath: string): Promise<DepEntry[]> {
  try {
    const content = JSON.parse(await readFile(lockPath, "utf8"));
    const entries: DepEntry[] = [];
    const packages = content.packages ?? {};

    for (const [key, value] of Object.entries(packages)) {
      // Skip root package and empty keys
      if (key === "" || !key.startsWith("node_modules/")) continue;

      const name = key.replace(/^node_modules\//, "");
      const version = (value as Record<string, unknown>)?.version as string | undefined;
      const license = (value as Record<string, unknown>)?.license as string | undefined;

      if (name && version) {
        entries.push({ name, version, type: "npm", license: typeof license === "string" ? license : undefined });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

async function extractFromPackageJson(cwd: string): Promise<DepEntry[]> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
    const entries: DepEntry[] = [];

    const deps = {
      ...((pkg.dependencies ?? {}) as Record<string, string>),
    };

    for (const [name, version] of Object.entries(deps)) {
      const cleanVersion = version.replace(/^[\^~>=<]/, "");
      entries.push({ name, version: cleanVersion, type: "npm" });
    }

    return entries;
  } catch {
    return [];
  }
}
