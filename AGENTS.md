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
| `apps/web/` | Documentation + Registry UI (Astro) | `astro build` / Cloudflare Pages |

`@capsule/shared` is the API contract between CLI ↔ Keyring ↔ Registry.

## Key commands

```bash
bun run typecheck                    # all packages
bun run compile                      # CLI → native binary (bun build --compile)
bun run compile-installer            # Installer binary
bun run keyring:dev                  # wrangler dev for Keyring
bun run registry:dev                 # wrangler dev for Registry
bun run web:dev                      # Astro dev server for web app
bun run web:build                    # Build web app for production
bun run keyring:deploy               # wrangler deploy
bun run registry:deploy              # wrangler deploy
bun run bump                         # version bump script
bun run --cwd apps/cli compile -- <target> <name>  # cross-compile
```

`compile` and `compile-installer` pass `--minify --bytecode --splitting` to `bun build`.

## CLI Commands (v2.3.0+)

| Command | Description |
|---|---|
| `capsule build` | Build project into `.capsule.app` archive |
| `capsule certificate` | Manage signing certificates |
| `capsule execute` / `capsule x` | Run a capsule ephemerally (download + run + discard) |
| `capsule info` | Show app details including SBOM dependencies |
| `capsule init` | Interactive project creation |
| `capsule list` | List installed apps |
| `capsule registry install` | Download, verify, and install (with permission prompt) |
| `capsule registry publish` | Publish to registry |
| `capsule registry search` | Search the registry |
| `capsule registry info` | Show remote package info |
| `capsule registry download` | Download archive without installing |
| `capsule registry remove` | Tombstone a package |
| `capsule registry transfer` | Transfer package ownership |
| `capsule repl` | Open an interactive REPL with a capsule's exports loaded |
| `capsule run` | Run a local `.capsule.app` archive |
| `capsule secret` | Manage secrets for installed apps |
| `capsule uninstall` | Remove an installed app |
| `capsule update` | Update installed apps to latest version |
| `capsule upgrade` | Upgrade the Capsule CLI itself |
| `capsule whoami` | Show local certificate identity |

## New Features (v2.3.0)

### Granular Permissions (Sandbox)
- Strict by default: apps have NO filesystem, network, env, or subprocess access unless declared in `capsule.config.ts`
- Permission schema in `packages/shared/src/index.ts`: `PermissionSchema` with `fs`, `net`, `env`, `subprocess` fields
- During install, users are prompted to accept/reject requested permissions
- Runtime sandbox implemented in `apps/cli/src/core/sandbox.ts`:
  - `process.env` is proxied to enforce env variable access
  - Permission check functions: `checkFSPermission`, `checkNetPermission`, `checkEnvPermission`, `checkSubprocessPermission`
- Activated via `activateSandbox(appName)` or `activateSandboxWithPermissions(permissions, name)` in `runner.ts`
- Proxy installation via `installSandboxProxies()`

### SBOM (Software Bill of Materials)
- CycloneDX SBOM auto-generated during `capsule build` in `apps/cli/src/core/sbom.ts`
- Extracts dependencies from `package-lock.json` or `package.json`
- Saved as `sbom.json` in the `.capsule.app` archive
- Content hash algorithm updated to include SBOM bytes
- Viewable via `capsule info <app>`

### Ephemeral Execution
- `capsule execute <name>` or `capsule x <name>` downloads, runs, and discards a capsule
- Implemented in `apps/cli/src/commands/execute.ts`
- Uses temp directory, sandbox permissions from manifest, cleanup on completion

### Auto-Update Notifications
- Background update check when running installed apps (in `apps/cli/src/core/app-update.ts`)
- Writes `.update-available` flag file when newer version exists
- Runner displays notification on next execution
- `capsule update <name>` updates a specific app (already existed, enhanced)

### Plugins/Extensions between Capsules
- Global `Capsule.importApp(appName)` API injected by `runner.ts`
- Allows installed capsules to import and use other capsules as plugins
- `Capsule.importFromRegistry(name)` for ephemeral plugin imports
- Sandbox isolation applied to imported capsules

### Capsule REPL
- `capsule repl <app>` opens a Node.js REPL with the app's exports loaded
- Implemented in `apps/cli/src/commands/repl.ts`
- `.exports` command lists loaded exports
- Module exports available in the REPL context

## Web App (apps/web/)

- Astro 6 static site with Tailwind CSS v4
- Dark mode throughout, Homebrew-inspired design
- `apps/web/src/pages/index.astro` — Landing page with hero, features, install instructions
- `apps/web/src/pages/docs/index.astro` — Documentation index
- `apps/web/src/pages/docs/[slug].astro` — Individual doc pages (renders from `src/content/docs/*.md`)
- `apps/web/src/pages/registry/index.astro` — Registry search UI with live API queries

### Building the web app
```bash
bun run web:dev        # Development server
bun run web:build      # Static build → apps/web/dist/
bun run web:preview    # Preview production build
```

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
