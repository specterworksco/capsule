import { ManifestSchema, RegistryAppNameSchema, RegistryVersionSchema, type Manifest } from "@capsule/shared";
import { strFromU8, unzipSync } from "fflate";

export type CapsuleContent = {
  manifest: Manifest;
  manifestBytes: Uint8Array;
  bundleBytes: Uint8Array;
};

export function readCapsuleContent(bytes: Uint8Array): CapsuleContent {
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

  const manifest = ManifestSchema.parse(JSON.parse(strFromU8(manifestBytes)));
  const name = RegistryAppNameSchema.safeParse(manifest.name);
  if (!name.success) {
    throw new Error("Invalid package name. Use lowercase letters, numbers, and hyphens only.");
  }

  const version = RegistryVersionSchema.safeParse(manifest.version);
  if (!version.success) {
    throw new Error("Invalid package version. Use semver format like 1.2.3.");
  }

  if (!manifest.author?.trim()) {
    throw new Error("Invalid manifest: author is required");
  }

  return { manifest, manifestBytes, bundleBytes };
}
