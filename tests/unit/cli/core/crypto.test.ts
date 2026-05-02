import { describe, expect, test } from "bun:test";
import {
  computeContentHash,
  signContentHash,
  signMessage,
  verifyCapsuleSignature,
} from "../../../../apps/cli/src/core/crypto";

async function generateKeyPair() {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer;
  const privateKey = (await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)) as ArrayBuffer;

  return {
    publicKey: Buffer.from(publicKey).toString("base64"),
    privateKey: Buffer.from(privateKey).toString("base64"),
  };
}

describe("computeContentHash", () => {
  test("produces a 64-character hex string", async () => {
    const hash = await computeContentHash(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    expect(await computeContentHash(a, b)).toBe(await computeContentHash(a, b));
  });

  test("changes when manifest changes", async () => {
    const b = new Uint8Array([4, 5, 6]);
    expect(await computeContentHash(new Uint8Array([1, 2, 3]), b)).not.toBe(
      await computeContentHash(new Uint8Array([1, 2, 4]), b),
    );
  });

  test("changes when bundle changes", async () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(await computeContentHash(a, new Uint8Array([4, 5, 6]))).not.toBe(
      await computeContentHash(a, new Uint8Array([4, 5, 7])),
    );
  });

  test("handles empty inputs", async () => {
    const hash = await computeContentHash(new Uint8Array(0), new Uint8Array(0));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("signMessage and verifyCapsuleSignature", () => {
  test("signs and verifies a message round-trip", async () => {
    const pair = await generateKeyPair();
    const message = "test-message";

    const sig = await signMessage(message, pair.privateKey);
    const valid = await verifyCapsuleSignature(message, {
      certificateId: "550e8400-e29b-41d4-a716-446655440000",
      signature: sig,
      publicKey: pair.publicKey,
    });

    expect(valid).toBe(true);
  });

  test("rejects tampered message", async () => {
    const pair = await generateKeyPair();
    const sig = await signMessage("original", pair.privateKey);
    const valid = await verifyCapsuleSignature("tampered", {
      certificateId: "550e8400-e29b-41d4-a716-446655440000",
      signature: sig,
      publicKey: pair.publicKey,
    });

    expect(valid).toBe(false);
  });

  test("rejects wrong public key", async () => {
    const pair1 = await generateKeyPair();
    const pair2 = await generateKeyPair();
    const sig = await signMessage("test", pair1.privateKey);
    const valid = await verifyCapsuleSignature("test", {
      certificateId: "550e8400-e29b-41d4-a716-446655440000",
      signature: sig,
      publicKey: pair2.publicKey,
    });

    expect(valid).toBe(false);
  });

  test("rejects corrupt signature base64", async () => {
    const pair = await generateKeyPair();
    const valid = await verifyCapsuleSignature("test", {
      certificateId: "550e8400-e29b-41d4-a716-446655440000",
      signature: "!!!not-valid-base64!!!",
      publicKey: pair.publicKey,
    });

    expect(valid).toBe(false);
  });
});

describe("signContentHash", () => {
  test("delegates to signMessage", async () => {
    const pair = await generateKeyPair();
    const hash = await computeContentHash(new Uint8Array([1]), new Uint8Array([2]));
    const sig = await signContentHash(hash, pair.privateKey);
    expect(sig).toBeTruthy();
    expect(typeof sig).toBe("string");
  });
});
