import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { strToU8 } from "fflate";
import type { BuildOptions, BuildResult } from "../types";
import { createCapsuleArchive } from "./archive";
import { computeContentHash, signContentHash } from "./crypto";
import { configToManifest, loadCapsuleConfig } from "./manifest";
import { loadCertificate } from "./store";
import { generateSBOM } from "./sbom";

export async function buildCapsule(options: BuildOptions): Promise<BuildResult> {
  const cwd = resolve(options.cwd);
  const config = await loadCapsuleConfig(cwd);
  const manifest = configToManifest(config);
  const entryPath = resolve(cwd, config.entry);

  let bundle = await bundleProject(entryPath);

  if (options.protect) {
    const { default: JavaScriptObfuscator } = await import("javascript-obfuscator");
    const code = new TextDecoder().decode(bundle);
    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      deadCodeInjection: true,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: "hexadecimal",
      log: false,
      numbersToExpressions: true,
      renameGlobals: false,
      selfDefending: true,
      simplify: true,
      splitStrings: true,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ["base64"],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxDepth: 3,
      stringArrayWrappersType: "function",
      unicodeEscapeSequence: false,
    });
    bundle = strToU8(obfuscated.getObfuscatedCode());
  }

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = strToU8(manifestJson);
  const files: Record<string, Uint8Array | string> = {
    "manifest.json": manifestBytes,
    "bundle.js": bundle,
  };

  // Generate SBOM and include in archive
  let sbomBytes: Uint8Array | undefined;
  try {
    const sbom = await generateSBOM(cwd);
    if (sbom) {
      const sbomJson = JSON.stringify(sbom, null, 2);
      sbomBytes = strToU8(sbomJson);
      files["sbom.json"] = sbomBytes;
    }
  } catch {
    // SBOM generation is best-effort
  }

  // Bundle assets declared in capsule.config.ts
  if (config.assets && config.assets.length > 0) {
    for (const pattern of config.assets) {
      const glob = new Bun.Glob(pattern);
      for await (const match of glob.scan({ cwd, absolute: false })) {
        const fullPath = resolve(cwd, match);
        const relPath = relative(cwd, fullPath);
        files[relPath] = new Uint8Array(await readFile(fullPath));
      }
    }
  }
  let signed = false;

  const certificate = await loadCertificate();
  if (certificate) {
    const contentHash = await computeContentHash(manifestBytes, bundle, sbomBytes);
    const signature = await signContentHash(contentHash, certificate.privateKey);
    files["capsule.sig"] = JSON.stringify(
      {
        certificateId: certificate.certificateId,
        signature,
        publicKey: certificate.publicKey,
      },
      null,
      2,
    );
    signed = true;
  }

  const archive = createCapsuleArchive(files);

  const outputPath = resolve(cwd, options.output ?? `dist/${manifest.name}.capsule.app`);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, archive);

  return { outputPath, signed };
}

async function bundleProject(entryPath: string): Promise<Uint8Array> {
  const result = await Bun.build({
    entrypoints: [entryPath],
    target: "bun",
    format: "esm",
    minify: false,
  });

  if (!result.success) {
    const message = result.logs.map((log) => log.message).join("\n") || "Bun.build failed";
    throw new Error(message);
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error("Bun.build did not produce a bundle");
  }

  return new Uint8Array(await output.arrayBuffer());
}
