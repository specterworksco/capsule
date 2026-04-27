import { z } from "zod";
import { AuthorSchema } from "./keyring";

export const DEFAULT_REGISTRY_SERVER = "https://registry.usecapsule.net";

export const RegistryAppNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const RegistryVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

export const RegistryAppMetadataSchema = z.object({
  latestVersion: RegistryVersionSchema,
  certificateId: z.string().uuid(),
  author: AuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

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

export const RegistryResolveResponseSchema = z.object({
  name: RegistryAppNameSchema,
  version: RegistryVersionSchema,
  downloadUrl: z.string().url(),
  author: AuthorSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const RegistryAppInfoResponseSchema = z.object({
  name: RegistryAppNameSchema,
  author: AuthorSchema,
  latestVersion: RegistryVersionSchema,
  versions: z.array(
    z.object({
      version: RegistryVersionSchema,
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      publishedAt: z.string().datetime(),
    }),
  ),
});

export type RegistryAppMetadata = z.infer<typeof RegistryAppMetadataSchema>;
export type RegistryVersionMetadata = z.infer<typeof RegistryVersionMetadataSchema>;
export type RegistryPublishResponse = z.infer<typeof RegistryPublishResponseSchema>;
export type RegistryResolveResponse = z.infer<typeof RegistryResolveResponseSchema>;
export type RegistryAppInfoResponse = z.infer<typeof RegistryAppInfoResponseSchema>;
