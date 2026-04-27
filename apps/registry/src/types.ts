export type Env = {
  CAPSULE_REGISTRY: KVNamespace;
  CAPSULE_APPS: R2Bucket;
  KEYRING_SERVER: string;
};

export type PublishedVersion = {
  version: string;
  hash: string;
  publishedAt: string;
};
