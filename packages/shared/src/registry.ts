import { z } from "zod";
import { AuthorSchema } from "./keyring";

export const DEFAULT_REGISTRY_SERVER = "https://registry.usecapsule.net";
export const REGISTRY_ACTION_MAX_SKEW_MS = 5 * 60 * 1000;
export const REGISTRY_TOMBSTONE_MESSAGE = "Este paquete fue deprecado intencionalmente, no es posible obtenerlo.";

export const RegistryAppNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const RegistryVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

export const RegistryActiveAppMetadataSchema = z.object({
  state: z.literal("active"),
  latestVersion: RegistryVersionSchema,
  certificateId: z.string().uuid(),
  author: AuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RegistryTombstonedAppMetadataSchema = z.object({
  state: z.literal("tombstoned"),
  certificateId: z.string().uuid(),
  author: AuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tombstonedAt: z.string().datetime(),
  tombstoneMessage: z.string().min(1),
});

export const RegistryAppMetadataSchema = z.discriminatedUnion("state", [
  RegistryActiveAppMetadataSchema,
  RegistryTombstonedAppMetadataSchema,
]);

export const RegistryVersionMetadataSchema = z.object({
  r2Key: z.string().min(1),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
});

export const RegistryPublishResponseSchema = z.object({
  success: z.literal(true),
  name: RegistryAppNameSchema,
  version: RegistryVersionSchema,
  downloadUrl: z.string().url(),
});

export const RegistryResolveResponseSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("active"),
    name: RegistryAppNameSchema,
    version: RegistryVersionSchema,
    downloadUrl: z.string().url(),
    author: AuthorSchema,
    certificateId: z.string().uuid(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    state: z.literal("tombstoned"),
    name: RegistryAppNameSchema,
    author: AuthorSchema,
    certificateId: z.string().uuid(),
    tombstonedAt: z.string().datetime(),
    tombstoneMessage: z.string().min(1),
  }),
]);

export const RegistryPublishedVersionSchema = z.object({
  version: RegistryVersionSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
});

export const RegistryAppInfoResponseSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("active"),
    name: RegistryAppNameSchema,
    author: AuthorSchema,
    certificateId: z.string().uuid(),
    latestVersion: RegistryVersionSchema,
    versions: z.array(RegistryPublishedVersionSchema),
  }),
  z.object({
    state: z.literal("tombstoned"),
    name: RegistryAppNameSchema,
    author: AuthorSchema,
    certificateId: z.string().uuid(),
    tombstonedAt: z.string().datetime(),
    tombstoneMessage: z.string().min(1),
  }),
]);

export const RegistrySignedMutationSchema = z.object({
  certificateId: z.string().uuid(),
  issuedAt: z.string().datetime(),
  signature: z.string().min(1),
});

export const RegistryTransferRequestSchema = RegistrySignedMutationSchema.extend({
  toCertificateId: z.string().uuid(),
});

export const RegistryTransferResponseSchema = z.object({
  success: z.literal(true),
  name: RegistryAppNameSchema,
  certificateId: z.string().uuid(),
  toCertificateId: z.string().uuid(),
});

export const RegistryRemoveRequestSchema = RegistrySignedMutationSchema;

export const RegistryRemoveResponseSchema = z.object({
  success: z.literal(true),
  name: RegistryAppNameSchema,
  tombstonedAt: z.string().datetime(),
  tombstoneMessage: z.string().min(1),
});

export const RegistryOwnedPackagesResponseSchema = z.object({
  certificateId: z.string().uuid(),
  packages: z.array(RegistryAppNameSchema),
});

export function createRegistryRemoveMessage(name: string, issuedAt: string): string {
  return `capsule-registry:remove:${name}:${issuedAt}`;
}

export function createRegistryTransferMessage(name: string, toCertificateId: string, issuedAt: string): string {
  return `capsule-registry:transfer:${name}:${toCertificateId}:${issuedAt}`;
}

export type RegistryAppMetadata = z.infer<typeof RegistryAppMetadataSchema>;
export type RegistryActiveAppMetadata = z.infer<typeof RegistryActiveAppMetadataSchema>;
export type RegistryTombstonedAppMetadata = z.infer<typeof RegistryTombstonedAppMetadataSchema>;
export type RegistryVersionMetadata = z.infer<typeof RegistryVersionMetadataSchema>;
export type RegistryPublishResponse = z.infer<typeof RegistryPublishResponseSchema>;
export type RegistryResolveResponse = z.infer<typeof RegistryResolveResponseSchema>;
export type RegistryAppInfoResponse = z.infer<typeof RegistryAppInfoResponseSchema>;
export type RegistryPublishedVersion = z.infer<typeof RegistryPublishedVersionSchema>;
export type RegistryTransferRequest = z.infer<typeof RegistryTransferRequestSchema>;
export type RegistryTransferResponse = z.infer<typeof RegistryTransferResponseSchema>;
export type RegistryRemoveRequest = z.infer<typeof RegistryRemoveRequestSchema>;
export type RegistryRemoveResponse = z.infer<typeof RegistryRemoveResponseSchema>;
export type RegistryOwnedPackagesResponse = z.infer<typeof RegistryOwnedPackagesResponseSchema>;
