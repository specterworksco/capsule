import type { CapsuleSignature } from "@capsule/shared";

const CONTENT_HASH_DOMAIN = new TextEncoder().encode("capsule-content-v1");

export async function computeContentHash(manifestBytes: Uint8Array, bundleBytes: Uint8Array): Promise<string> {
  const bytes = concatBytes(
    CONTENT_HASH_DOMAIN,
    encodeLength(manifestBytes.byteLength),
    manifestBytes,
    encodeLength(bundleBytes.byteLength),
    bundleBytes,
  );
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));

  return bytesToHex(new Uint8Array(digest));
}

export async function signContentHash(contentHash: string, privateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", base64ToArrayBuffer(privateKey), { name: "Ed25519" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(contentHash));

  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyCapsuleSignature(contentHash: string, signature: CapsuleSignature): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", base64ToArrayBuffer(signature.publicKey), { name: "Ed25519" }, false, ["verify"]);

  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    base64ToArrayBuffer(signature.signature),
    new TextEncoder().encode(contentHash),
  );
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function encodeLength(length: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(length), false);

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  return toArrayBuffer(Buffer.from(value, "base64"));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
