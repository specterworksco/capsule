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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
