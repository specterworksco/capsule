import { z } from "zod";

export const CapsuleConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  assets: z.array(z.string()).optional(),
});

export const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  author: z.string().optional(),
  description: z.string().optional(),
  entry: z.literal("bundle.js"),
});

export type CapsuleConfig = z.infer<typeof CapsuleConfigSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export * from "./keyring";
export * from "./registry";
