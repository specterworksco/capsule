export async function generateCertificateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer;
  const privateKey = (await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)) as ArrayBuffer;

  return {
    publicKey: bytesToBase64(new Uint8Array(publicKey)),
    privateKey: bytesToBase64(new Uint8Array(privateKey)),
  };
}

export async function verifyContentHashSignature(contentHash: string, signature: string, publicKey: string): Promise<boolean> {
  return verifySignedMessage(contentHash, signature, publicKey);
}

export async function verifySignedMessage(message: string, signature: string, publicKey: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, base64ToBytes(signature), new TextEncoder().encode(message));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
