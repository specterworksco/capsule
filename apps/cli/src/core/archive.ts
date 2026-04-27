import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CapsuleSignatureSchema, type CapsuleSignature, type Manifest } from "@capsule/shared";
import { parseManifest } from "./manifest";

export type CapsuleArchive = {
  manifest: Manifest;
  signature?: CapsuleSignature;
  files: Record<string, Uint8Array>;
};

export function createCapsuleArchive(files: Record<string, Uint8Array | string>): Uint8Array {
  const normalized: Record<string, Uint8Array> = {};

  for (const [name, content] of Object.entries(files)) {
    normalized[name] = typeof content === "string" ? strToU8(content) : content;
  }

  return zipSync(normalized, { level: 9 });
}

export function readCapsuleArchive(bytes: Uint8Array): CapsuleArchive {
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new Error(`Invalid capsule archive: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) {
    throw new Error("Invalid capsule archive: missing manifest.json");
  }

  const bundleBytes = files["bundle.js"];
  if (!bundleBytes) {
    throw new Error("Invalid capsule archive: missing bundle.js");
  }

  const manifest = parseManifest(JSON.parse(strFromU8(manifestBytes)));
  const signatureBytes = files["capsule.sig"];
  const signature = signatureBytes ? CapsuleSignatureSchema.parse(JSON.parse(strFromU8(signatureBytes))) : undefined;

  return { manifest, signature, files };
}

export function getRequiredContentFiles(archive: CapsuleArchive): { manifestBytes: Uint8Array; bundleBytes: Uint8Array } {
  const manifestBytes = archive.files["manifest.json"];
  const bundleBytes = archive.files["bundle.js"];

  if (!manifestBytes || !bundleBytes) {
    throw new Error("Invalid capsule archive: missing required content files");
  }

  return { manifestBytes, bundleBytes };
}
