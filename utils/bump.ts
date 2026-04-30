import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type PackageKey = "registry" | "keyring" | "cli";
type BumpKind = "major" | "minor" | "patch";

type PackageTarget = {
  key: PackageKey;
  label: string;
  path: string;
};

type PackageJson = {
  version?: string;
  [key: string]: unknown;
};

const targets: PackageTarget[] = [
  { key: "registry", label: "Registry", path: "apps/registry/package.json" },
  { key: "keyring", label: "Keyring", path: "apps/keyring/package.json" },
  { key: "cli", label: "CLI", path: "apps/cli/package.json" },
];

const bumpKinds: BumpKind[] = ["major", "minor", "patch"];

const rl = createInterface({ input, output });

try {
  const selected = await askPackages();
  if (selected.length === 0) {
    console.log("No packages selected. Nothing changed.");
    process.exit(0);
  }

  const changes: Array<{ target: PackageTarget; from: string; to: string; bump: BumpKind }> = [];

  for (const target of selected) {
    const pkg = await readPackage(target);
    const current = getVersion(pkg, target);
    const bump = await askBumpKind(target, current);
    const next = bumpVersion(current, bump);
    pkg.version = next;
    await writePackage(target, pkg);
    changes.push({ target, from: current, to: next, bump });
  }

  console.log("");
  console.log("Version bumps applied:");
  for (const change of changes) {
    console.log(`- ${change.target.label}: ${change.from} -> ${change.to} (${change.bump})`);
  }

  const files = changes.map((change) => change.target.path).join(" ");
  const scope = changes.length === 1 ? changes[0]?.target.key : "packages";
  const summary = changes.map((change) => `${change.target.key}@${change.to}`).join(", ");

  console.log("");
  console.log("Commit commands:");
  console.log(`git add ${files}`);
  console.log(`git commit -m "chore(release): bump ${scope} versions" -m "${summary}"`);
} finally {
  rl.close();
}

async function askPackages(): Promise<PackageTarget[]> {
  console.log("Select packages to bump:");
  for (const [index, target] of targets.entries()) {
    const pkg = await readPackage(target);
    console.log(`${index + 1}. ${target.label} (${getVersion(pkg, target)})`);
  }
  console.log("");
  console.log("Enter one or more values separated by commas or spaces. Examples: 1,3 | registry cli | all");

  while (true) {
    const answer = (await rl.question("Packages: ")).trim().toLowerCase();
    const selected = parsePackageSelection(answer);
    if (selected) {
      return selected;
    }

    console.log("Invalid selection. Use package numbers, names, or all.");
  }
}

async function askBumpKind(target: PackageTarget, current: string): Promise<BumpKind> {
  console.log("");
  console.log(`${target.label} current version: ${current}`);
  console.log(`1. major -> ${bumpVersion(current, "major")}`);
  console.log(`2. minor -> ${bumpVersion(current, "minor")}`);
  console.log(`3. patch -> ${bumpVersion(current, "patch")}`);

  while (true) {
    const answer = (await rl.question(`Bump ${target.key} [major/minor/patch]: `)).trim().toLowerCase();
    const bump = parseBumpKind(answer);
    if (bump) {
      return bump;
    }

    console.log("Invalid bump. Use major, minor, patch, or 1/2/3.");
  }
}

function parsePackageSelection(answer: string): PackageTarget[] | undefined {
  if (!answer) {
    return undefined;
  }

  if (answer === "all" || answer === "*") {
    return targets;
  }

  const parts = answer.split(/[\s,]+/).filter(Boolean);
  const selected = new Map<PackageKey, PackageTarget>();

  for (const part of parts) {
    const byNumber = Number.parseInt(part, 10);
    const target = Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= targets.length
      ? targets[byNumber - 1]
      : targets.find((item) => item.key === part);

    if (!target) {
      return undefined;
    }

    selected.set(target.key, target);
  }

  return Array.from(selected.values());
}

function parseBumpKind(answer: string): BumpKind | undefined {
  if (answer === "1") return "major";
  if (answer === "2") return "minor";
  if (answer === "3") return "patch";
  return bumpKinds.includes(answer as BumpKind) ? (answer as BumpKind) : undefined;
}

function bumpVersion(version: string, kind: BumpKind): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}. Expected x.y.z.`);
  }

  const major = Number.parseInt(match[1] ?? "0", 10);
  const minor = Number.parseInt(match[2] ?? "0", 10);
  const patch = Number.parseInt(match[3] ?? "0", 10);

  if (kind === "major") {
    return `${major + 1}.0.0`;
  }

  if (kind === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

async function readPackage(target: PackageTarget): Promise<PackageJson> {
  return JSON.parse(await readFile(resolve(target.path), "utf8")) as PackageJson;
}

async function writePackage(target: PackageTarget, pkg: PackageJson): Promise<void> {
  await writeFile(resolve(target.path), `${JSON.stringify(pkg, null, 2)}\n`);
}

function getVersion(pkg: PackageJson, target: PackageTarget): string {
  if (!pkg.version) {
    throw new Error(`${target.path} does not define a version.`);
  }

  return pkg.version;
}
