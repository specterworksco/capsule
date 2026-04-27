import { z } from "zod";

export const DEFAULT_KEYRING_SERVER = "https://keyring.usecapsule.net";

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
  }),
  z.object({
    verified: z.literal(false),
  }),
]);

export const CapsuleSignatureSchema = z.object({
  certificateId: z.string().uuid(),
  signature: z.string().min(1),
  publicKey: z.string().min(1),
});

export type Author = z.infer<typeof AuthorSchema>;
export type CertificateRequest = z.infer<typeof CertificateRequestSchema>;
export type CertificateResponse = z.infer<typeof CertificateResponseSchema>;
export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type PublishResponse = z.infer<typeof PublishResponseSchema>;
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
export type CapsuleSignature = z.infer<typeof CapsuleSignatureSchema>;
