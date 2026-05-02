import { describe, expect, test } from "bun:test";
import { generateCertificateKeyPair, verifySignedMessage, verifyContentHashSignature } from "../../../apps/keyring/src/crypto";

describe("generateCertificateKeyPair", () => {
  test("generates public and private key as base64", async () => {
    const pair = await generateCertificateKeyPair();
    expect(pair.publicKey).toBeTruthy();
    expect(pair.privateKey).toBeTruthy();

    const decoded = (s: string) => Buffer.from(s, "base64").byteLength;
    expect(decoded(pair.publicKey)).toBe(32);
    expect(decoded(pair.privateKey)).toBeGreaterThan(0);
  });

  test("generates different keys each time", async () => {
    const pair1 = await generateCertificateKeyPair();
    const pair2 = await generateCertificateKeyPair();
    expect(pair1.publicKey).not.toBe(pair2.publicKey);
    expect(pair1.privateKey).not.toBe(pair2.privateKey);
  });
});

describe("verifySignedMessage", () => {
  test("signs and verifies a message round-trip", async () => {
    const pair = await generateCertificateKeyPair();
    const message = "hello-world";

    const key = await crypto.subtle.importKey(
      "pkcs8",
      Buffer.from(pair.privateKey, "base64"),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(message));
    const signature = Buffer.from(signatureBytes).toString("base64");

    const valid = await verifySignedMessage(message, signature, pair.publicKey);
    expect(valid).toBe(true);
  });

  test("rejects tampered message", async () => {
    const pair = await generateCertificateKeyPair();
    const message = "hello-world";
    const tampered = "hello-world!" 

    const key = await crypto.subtle.importKey(
      "pkcs8",
      Buffer.from(pair.privateKey, "base64"),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(message));
    const signature = Buffer.from(signatureBytes).toString("base64");

    const valid = await verifySignedMessage(tampered, signature, pair.publicKey);
    expect(valid).toBe(false);
  });

  test("returns false on bad input", async () => {
    expect(await verifySignedMessage("x", "bad", "bad")).toBe(false);
  });
});

describe("verifyContentHashSignature", () => {
  test("delegates to verifySignedMessage", async () => {
    const pair = await generateCertificateKeyPair();
    const contentHash = "a".repeat(64);

    const key = await crypto.subtle.importKey(
      "pkcs8",
      Buffer.from(pair.privateKey, "base64"),
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    const signatureBytes = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(contentHash));
    const signature = Buffer.from(signatureBytes).toString("base64");

    expect(await verifyContentHashSignature(contentHash, signature, pair.publicKey)).toBe(true);
    expect(await verifyContentHashSignature("b".repeat(64), signature, pair.publicKey)).toBe(false);
  });
});
