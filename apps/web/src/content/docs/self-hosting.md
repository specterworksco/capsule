# Self-Hosting Capsule Services

## Table of Contents

- [Overview](#overview)
- [Required Cloudflare Resources](#required-cloudflare-resources)
- [Keyring Server](#keyring-server)
- [Registry Server](#registry-server)
- [CLI Configuration](#cli-configuration)
- [Deployment Commands](#deployment-commands)
- [Local Development](#local-development)

## Overview

The implemented Keyring and Registry services are Cloudflare Workers.

Self-hosting means running your own copies of:

- Keyring Worker with a Cloudflare KV namespace.
- Registry Worker with a Cloudflare KV namespace and R2 bucket.

The CLI can be pointed at custom service URLs with flags or environment variables.

## Required Cloudflare Resources

| Service | Resource | Binding |
| --- | --- | --- |
| Keyring | Worker | `apps/keyring/src/index.ts` |
| Keyring | KV namespace | `CAPSULE_KEYRING` |
| Registry | Worker | `apps/registry/src/index.ts` |
| Registry | KV namespace | `CAPSULE_REGISTRY` |
| Registry | R2 bucket | `CAPSULE_APPS` |

No secrets are currently required by either Worker.

## Keyring Server

Configuration file:

```text
apps/keyring/wrangler.toml
```

Implemented shape:

```toml
name = "capsule-keyring"
main = "src/index.ts"
compatibility_date = "2026-04-26"

routes = [
  { pattern = "keyring.usecapsule.net", custom_domain = true }
]

[[kv_namespaces]]
binding = "CAPSULE_KEYRING"
id = "7068aa43c243449a87b73fd670b0e24b"
preview_id = "7068aa43c243449a87b73fd670b0e24b"

[observability]
enabled = true
head_sampling_rate = 1
```

For your own deployment:

- Change `name` if desired.
- Change `routes` to your own domain, or remove it if deploying to a `workers.dev` route.
- Replace the KV namespace IDs with your own `CAPSULE_KEYRING` namespace.

## Registry Server

Configuration file:

```text
apps/registry/wrangler.toml
```

Implemented shape:

```toml
name = "capsule-registry"
main = "src/index.ts"
compatibility_date = "2026-04-26"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "registry.usecapsule.net", custom_domain = true }
]

[vars]
KEYRING_SERVER = "https://keyring.usecapsule.net"

[[kv_namespaces]]
binding = "CAPSULE_REGISTRY"
id = "96aa8b1669244f018733c1688a710241"
preview_id = "96aa8b1669244f018733c1688a710241"

[[r2_buckets]]
binding = "CAPSULE_APPS"
bucket_name = "capsule-apps"
preview_bucket_name = "capsule-apps"

[observability]
enabled = true
head_sampling_rate = 1
```

For your own deployment:

- Change `routes` to your own Registry domain.
- Set `KEYRING_SERVER` to your Keyring base URL.
- Replace the `CAPSULE_REGISTRY` KV namespace IDs.
- Set `bucket_name` and `preview_bucket_name` to your R2 bucket name.

## CLI Configuration

You can point the CLI at custom services per command:

```bash
capsule certificate request --keyring-server https://keyring.example.com
capsule registry publish dist/myapp.capsule.app --keyring-server https://keyring.example.com --registry-server https://registry.example.com
capsule registry install myapp --keyring-server https://keyring.example.com --registry-server https://registry.example.com
capsule info myapp --registry-server https://registry.example.com
```

Or set environment variables:

```bash
export CAPSULE_KEYRING_SERVER="https://keyring.example.com"
export CAPSULE_REGISTRY_SERVER="https://registry.example.com"
```

Flags override environment variables.

## Deployment Commands

From the repository root:

```bash
bun install
bun run typecheck
bun run keyring:deploy
bun run registry:deploy
```

Equivalent direct commands:

```bash
bun run --cwd apps/keyring deploy
bun run --cwd apps/registry deploy
```

Generate Worker types after changing `wrangler.toml`:

```bash
bun run --cwd apps/keyring types
bun run --cwd apps/registry types
```

## Local Development

Run the Keyring Worker locally:

```bash
bun run keyring:dev
```

Run the Registry Worker locally:

```bash
bun run registry:dev
```

When testing a local Registry against a local Keyring, update the Registry `KEYRING_SERVER` variable or run with a configuration that points to the local Keyring URL.

The CLI can then target the local services with:

```bash
capsule certificate request --keyring-server http://localhost:8787
capsule registry publish dist/myapp.capsule.app --keyring-server http://localhost:8787 --registry-server http://localhost:8788
capsule registry install myapp --keyring-server http://localhost:8787 --registry-server http://localhost:8788
```
