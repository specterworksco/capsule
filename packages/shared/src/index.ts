import { z } from "zod";

export const PermissionSchema = z.object({
  fs: z
    .array(z.enum(["read", "readwrite", "write"]))
    .describe("File system access: read, readwrite, write (write implies no read)")
    .optional(),
  net: z
    .union([
      z.array(z.string()),
      z.boolean(),
    ])
    .describe("Network access: boolean for all, or array of host strings")
    .optional(),
  env: z
    .union([
      z.array(z.string()),
      z.boolean(),
    ])
    .describe("Environment variables: boolean for all, or array of variable names")
    .optional(),
  subprocess: z
    .boolean()
    .describe("Permission to spawn child processes")
    .optional(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const CapsuleConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  assets: z.array(z.string()).optional(),
  permissions: PermissionSchema.optional(),
});

export const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  entry: z.literal("bundle.js"),
  permissions: PermissionSchema.optional(),
});

export type CapsuleConfig = z.infer<typeof CapsuleConfigSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export * from "./keyring";
export * from "./registry";
