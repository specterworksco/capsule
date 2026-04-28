import { z } from "zod";

export const DEFAULT_KEYRING_SERVER = "https://keyring.usecapsule.net";
export const KEYRING_ACTION_MAX_SKEW_MS = 5 * 60 * 1000;

export const AuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const CertificateRequestSchema = AuthorSchema;

export const CertificateResponseSchema = z.object({
  certificateId: z.string().uuid(),
  publicKey: z.string().min(1),
  privateKey: z.string().min(1),
  issuedAt: z.string().datetime(),
  author: AuthorSchema,
});

export const CertificateRecordSchema = z.object({
  certificateId: z.string().uuid(),
  publicKey: z.string().min(1),
  issuedAt: z.string().datetime(),
  author: AuthorSchema,
  revokedAt: z.string().datetime().optional(),
  replacedByCertificateId: z.string().uuid().optional(),
});

export const PublishRequestSchema = z.object({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  certificateId: z.string().uuid(),
});

export const PublishResponseSchema = z.object({
  success: z.literal(true),
  author: AuthorSchema,
});

export const VerifyResponseSchema = z.discriminatedUnion("verified", [
  z.object({
    verified: z.literal(true),
    certificateId: z.string().uuid(),
    author: AuthorSchema,
    publishedAt: z.string().datetime(),
    publicKey: z.string().min(1),
    revokedAt: z.string().datetime().optional(),
    replacedByCertificateId: z.string().uuid().optional(),
  }),
  z.object({
    verified: z.literal(false),
  }),
]);

export const CertificateRevokeRequestSchema = z.object({
  replacementCertificateId: z.string().uuid().optional(),
  issuedAt: z.string().datetime(),
  signature: z.string().min(1),
});

export const CertificateRevokeResponseSchema = z.object({
  success: z.literal(true),
  certificateId: z.string().uuid(),
  revokedAt: z.string().datetime(),
  replacedByCertificateId: z.string().uuid().optional(),
});

export const CapsuleSignatureSchema = z.object({
  certificateId: z.string().uuid(),
  signature: z.string().min(1),
  publicKey: z.string().min(1),
});

export function createCertificateRevokeMessage(
  certificateId: string,
  replacementCertificateId: string | undefined,
  issuedAt: string,
): string {
  return `capsule-keyring:revoke:${certificateId}:${replacementCertificateId ?? "none"}:${issuedAt}`;
}

export type Author = z.infer<typeof AuthorSchema>;
export type CertificateRequest = z.infer<typeof CertificateRequestSchema>;
export type CertificateResponse = z.infer<typeof CertificateResponseSchema>;
export type CertificateRecord = z.infer<typeof CertificateRecordSchema>;
export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type CertificateRevokeRequest = z.infer<typeof CertificateRevokeRequestSchema>;
export type CertificateRevokeResponse = z.infer<typeof CertificateRevokeResponseSchema>;
export type CapsuleSignature = z.infer<typeof CapsuleSignatureSchema>;
