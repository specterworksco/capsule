import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = join(cliRoot, "../..");
const entrypoint = join(workspaceRoot, "scripts/install.ts");
const outDir = join(workspaceRoot, "scripts/dist");
const target = process.argv[2];
const outputName = process.argv[3] ?? `capsule-installer-${target ?? "native"}`;
const outfile = join(outDir, outputName);
const targetArgs = target ? [`--target=${target}`] : [];

await mkdir(outDir, { recursive: true });

const proc = Bun.spawn({
  cmd: [
    "bun", "build", "--compile", "--minify", "--bytecode",
    ...targetArgs,
    entrypoint,
    "--outfile", outfile,
  ],
  cwd: workspaceRoot,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
