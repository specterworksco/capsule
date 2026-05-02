# Capsule — Agent Guide

## Quick start

```bash
bun install
bun run typecheck   # tsc --noEmit across all workspaces
bun test            # bun:test runner
bun run compile     # native binary → apps/cli/dist/capsule*
```

CI order: `typecheck` → `test` → `compile` (all required).

## Monorepo structure

| Path | What | Runtime |
|---|---|---|
| `apps/cli/` | Capsule CLI (native binary) | Bun-compiled standalone |
| `apps/keyring/` | Keyring server (CF Worker) | `wrangler dev` / `wrangler deploy` |
| `apps/registry/` | Registry server (CF Worker) | `wrangler dev` / `wrangler deploy` |
| `packages/shared/` | Zod schemas + API types | Imported by all three |

`@capsule/shared` is the API contract between CLI ↔ Keyring ↔ Registry.

## Key commands

```bash
bun run typecheck                    # all packages
bun run compile                      # CLI → native binary (bun build --compile)
bun run compile-installer            # Installer binary
bun run keyring:dev                  # wrangler dev for Keyring
bun run registry:dev                 # wrangler dev for Registry
bun run keyring:deploy               # wrangler deploy
bun run registry:deploy              # wrangler deploy
bun run bump                         # version bump script
bun run --cwd apps/cli compile -- <target> <name>  # cross-compile
```

`compile` and `compile-installer` pass `--minify --bytecode --splitting` to `bun build`.

## TypeScript quirks

- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `moduleResolution: bundler`, `allowImportingTsExtensions: true`
- `noEmit: true` — typecheck only, Bun runs `.ts` directly
- CLI tsconfig extends `tsconfig.base.json` from root
- After editing `packages/shared`, run `typecheck` — there is no build step for it

## Test quirks

- Tests import actual Worker apps (Keyring, Registry) directly, no wrangler needed
- `createTestEnv()` creates in-memory KV/R2 + local HTTP servers for Keyring and Registry
- `withTempHome(fn)` isolates filesystem; `CAPSULE_HOME` is set to a temp dir
- `captureConsole(fn)` captures stdout/stderr for assertion
- Test flow: `requestCertificate` → `createSignedCapsule` → `publishToKeyring` → `publishToRegistry` → run CLI command
- All tests are integration tests; there are no unit tests

## CF Worker details

Both Workers use Hono + CORS. Deploy via `wrangler deploy`.

**Keyring** (`apps/keyring/`):
- KV binding: `CAPSULE_KEYRING`
- Routes: `/certificates`, `/certificates/:id/revoke`, `/publish`, `/verify/:hash`
- Custom domain: `keyring.usecapsule.net`

**Registry** (`apps/registry/`):
- KV binding: `CAPSULE_REGISTRY`, R2 binding: `CAPSULE_APPS`
- `nodejs_compat` flag enabled
- Routes: `/publish`, `/resolve/:name`, `/download/:name/:version`, `/apps/:name`, `/apps/:name/remove`, `/apps/:name/transfer`, `/owners/:id/apps`
- Custom domain: `registry.usecapsule.net`
- Regenerates Worker types: `bun run --cwd apps/registry types`

## Release flow

Version is read from root `package.json`. On push to `main` when `package.json` changes, CI:
1. Checks if `v<version>` tag exists remotely
2. If not: builds all 15 platform binaries + 6 installer binaries
3. Creates release + tag

```bash
bun run bump              # version bump helper
git tag v<x.y.z>          # manual tagging before CI
```

## Conventions

- No linter/formatter configured — `typecheck` is the only static check
- No pre-commit hooks
- All source is ESM (`"type": "module"`)
- Private packages throughout
