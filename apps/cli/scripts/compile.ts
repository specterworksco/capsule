import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = join(cliRoot, "../..");
const entrypoint = join(cliRoot, "src/index.ts");
const outDir = join(cliRoot, "dist");
const outfile = join(outDir, process.platform === "win32" ? "capsule.exe" : "capsule");

await mkdir(outDir, { recursive: true });

const proc = Bun.spawn({
  cmd: ["bun", "build", "--compile", entrypoint, "--outfile", outfile],
  cwd: workspaceRoot,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const exitCode = await proc.exited;
process.exit(exitCode);
