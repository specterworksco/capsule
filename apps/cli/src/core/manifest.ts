import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CapsuleConfigSchema, ManifestSchema, type CapsuleConfig, type Manifest } from "@capsule/shared";

type PackageJson = {
  name?: string;
  version?: string;
  author?: string | { name?: string; email?: string };
  description?: string;
  bin?: string | Record<string, string>;
  main?: string;
};

export async function loadCapsuleConfig(cwd: string): Promise<CapsuleConfig> {
  const configPath = join(cwd, "capsule.config.ts");

  if (existsSync(configPath)) {
    const url = pathToFileURL(configPath);
    url.searchParams.set("t", Date.now().toString());
    const mod = await import(url.href);
    return CapsuleConfigSchema.parse(mod.default);
  }

  return loadConfigFromPackageJson(cwd);
}

export function configToManifest(config: CapsuleConfig): Manifest {
  return ManifestSchema.parse({
    name: config.name,
    version: config.version,
    author: config.author,
    description: config.description,
    entry: "bundle.js",
  });
}

export function parseManifest(input: unknown): Manifest {
  return ManifestSchema.parse(input);
}

async function loadConfigFromPackageJson(cwd: string): Promise<CapsuleConfig> {
  const packagePath = join(cwd, "package.json");

  if (!existsSync(packagePath)) {
    throw new Error("Missing capsule.config.ts and package.json");
  }

  const pkg = JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;
  const entry = resolvePackageEntry(pkg);

  return CapsuleConfigSchema.parse({
    name: pkg.name,
    version: pkg.version,
    entry,
    author: normalizeAuthor(pkg.author),
    description: pkg.description,
  });
}

function resolvePackageEntry(pkg: PackageJson): string | undefined {
  if (typeof pkg.bin === "string") {
    return pkg.bin;
  }

  if (pkg.bin && pkg.name && pkg.bin[pkg.name]) {
    return pkg.bin[pkg.name];
  }

  if (pkg.bin) {
    return Object.values(pkg.bin)[0];
  }

  return pkg.main;
}

function normalizeAuthor(author: PackageJson["author"]): string | undefined {
  if (!author) {
    return undefined;
  }

  if (typeof author === "string") {
    return author;
  }

  if (author.email && author.name) {
    return `${author.name} <${author.email}>`;
  }

  return author.name ?? author.email;
}
