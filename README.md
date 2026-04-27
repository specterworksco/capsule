# Capsule

Capsule packages JavaScript and TypeScript command-line apps into `.capsule.app` archives and installs them behind a single native `capsule` binary.

The goal is practical distribution: users can install and run a Capsule app without installing Node.js, Bun, npm, or the app source tree. Developers build one archive, sign it with a Keyring certificate, and publish it to a Registry so users can install it by name.

## Contents

- [End User Quick Start](#end-user-quick-start)
- [Developer Quick Start](#developer-quick-start)
- [Project Services](#project-services)
- [Repository Layout](#repository-layout)
- [Detailed Documentation](#detailed-documentation)

## End User Quick Start

Capsule currently builds the CLI binary from source:

```bash
bun install
bun run compile
```

The compiled binary is written to:

```text
apps/cli/dist/capsule
```

Put that binary somewhere on your `PATH`, then install an app from the Registry:

```bash
capsule get myapp
```

You can also install directly from a `.capsule.app` URL:

```bash
capsule get https://example.com/myapp.capsule.app
```

Installed apps are stored under `~/.capsule/apps/`, and runnable shims are created under `~/.capsule/bin/`. Add `~/.capsule/bin` to your `PATH` if Capsule warns that it is missing.

## Developer Quick Start

Create a JavaScript or TypeScript project with either `capsule.config.ts` or a usable `package.json`.

Example `capsule.config.ts`:

```ts
export default {
  name: "myapp",
  version: "1.0.0",
  entry: "src/index.ts",
  author: "Jane Dev <jane@example.com>",
  description: "Example Capsule app",
};
```

Request a signing certificate:

```bash
capsule certificates request
```

Build a `.capsule.app` archive:

```bash
capsule build
```

Publish it to the Keyring and Registry:

```bash
capsule publish dist/myapp.capsule.app
```

Users can then install it with:

```bash
capsule get myapp
```

## Project Services

Capsule is split into three implemented parts:

| Service | Location | Purpose |
| --- | --- | --- |
| CLI | `apps/cli` | Builds `.capsule.app` archives, requests certificates, publishes apps, installs apps, and runs bundles. |
| Keyring | `apps/keyring` | Issues Ed25519 certificates and records signed content hashes as the trust source. |
| Registry | `apps/registry` | Stores `.capsule.app` files in R2, stores metadata in KV, and resolves package names to downloads. |

The normal publish path is:

```text
capsule build -> capsule publish -> Keyring /publish -> Registry /publish
```

The normal install path is:

```text
capsule get myapp -> Registry /resolve/myapp -> Registry /download/... -> Keyring /verify/:hash
```

## Repository Layout

```text
apps/cli          Capsule CLI and compiled binary target
apps/keyring      Cloudflare Worker Keyring service
apps/registry     Cloudflare Worker Registry service
packages/shared   Shared Zod schemas and API contract types
docs/             Detailed project documentation
```

Useful workspace commands:

```bash
bun install
bun run typecheck
bun run compile
bun run keyring:dev
bun run registry:dev
```

## Detailed Documentation

- [CLI reference](./docs/cli.md)
- [Capsule app file format](./docs/capsule-app-format.md)
- [Keyring Server](./docs/keyring.md)
- [Registry Server](./docs/registry.md)
- [Signing and verification](./docs/signing-and-verification.md)
- [Developing Capsule apps](./docs/developing-apps.md)
- [Security and sandboxing](./docs/security.md)
- [CI/CD publishing](./docs/ci-cd.md)
- [Self-hosting](./docs/self-hosting.md)
