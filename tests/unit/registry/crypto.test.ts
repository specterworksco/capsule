import { describe, expect, test } from "bun:test";
import { computeContentHash, verifySignedMessage } from "../../../apps/registry/src/crypto";

describe("computeContentHash", () => {
  test("produces a 64-character hex string", async () => {
    const hash = await computeContentHash(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic for same inputs", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6]);
    const hash1 = await computeContentHash(a, b);
    const hash2 = await computeContentHash(a, b);
    expect(hash1).toBe(hash2);
  });

  test("changes when manifest changes", async () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 4]);
    const b = new Uint8Array([4, 5, 6]);
    const hash1 = await computeContentHash(a1, b);
    const hash2 = await computeContentHash(a2, b);
    expect(hash1).not.toBe(hash2);
  });

  test("changes when bundle changes", async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b1 = new Uint8Array([4, 5, 6]);
    const b2 = new Uint8Array([4, 5, 7]);
    const hash1 = await computeContentHash(a, b1);
    const hash2 = await computeContentHash(a, b2);
    expect(hash1).not.toBe(hash2);
  });

  test("handles empty inputs", async () => {
    const hash = await computeContentHash(new Uint8Array(0), new Uint8Array(0));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("verifySignedMessage", () => {
  test("returns false for invalid public key", async () => {
    const result = await verifySignedMessage("test", "bad-sig", "bad-key");
    expect(result).toBe(false);
  });

  test("returns false for empty signature", async () => {
    const result = await verifySignedMessage("test", "", "");
    expect(result).toBe(false);
  });
});
