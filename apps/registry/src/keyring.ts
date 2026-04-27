import { VerifyResponseSchema, type VerifyResponse } from "@capsule/shared";
import type { Env } from "./types";

export async function verifyCapsuleHash(env: Env, hash: string): Promise<VerifyResponse> {
  const server = (env.KEYRING_SERVER || "https://keyring.usecapsule.net").replace(/\/+$/, "");
  const response = await fetch(`${server}/verify/${hash}`);

  if (!response.ok) {
    throw new Error(`Keyring verification failed: ${response.status}`);
  }

  return VerifyResponseSchema.parse(await response.json());
}
