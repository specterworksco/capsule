import { getRequiredContentFiles, readCapsuleArchive } from "./archive";
import { computeContentHash, verifyCapsuleSignature } from "./crypto";
import { resolveKeyringServer, verifyCapsule } from "./keyring-client";
import { logger } from "../utils/logger";

export async function verifyDownloadedCapsule(bytes: Uint8Array, keyringServer?: string): Promise<void> {
  const archive = readCapsuleArchive(bytes);
  const { manifestBytes, bundleBytes } = getRequiredContentFiles(archive);
  const contentHash = await computeContentHash(manifestBytes, bundleBytes);

  if (!archive.signature) {
    logger.warn("This capsule is not signed or could not be verified. Proceed with caution.");
    return;
  }

  const server = resolveKeyringServer(keyringServer);

  try {
    const response = await verifyCapsule(server, contentHash);
    if (response.verified) {
      logger.success(`Signed by ${response.author.name} (${response.author.email})`);
      if (response.revokedAt) {
        logger.warn(`The signing certificate was revoked on ${response.revokedAt}.`);
      }
      return;
    }

    logger.warn("This capsule is not trusted by the Keyring registry. Proceed with caution.");
  } catch {
    const valid = await verifyCapsuleSignature(contentHash, archive.signature);

    if (valid) {
      logger.warn("Offline verification successful. Keyring server unreachable, cannot confirm author identity.");
      return;
    }

    logger.warn("Signature is forged or corrupt. Proceed with caution.");
  }
}
