# Capsule

Capsule packages JavaScript and TypeScript command-line apps into `.capsule.app` archives and installs them behind a single native `capsule` binary.

The goal is practical distribution: users can install and run a Capsule app without installing Node.js, Bun, npm, or the app source tree. Developers build one archive, sign it with a Keyring certificate, and publish it to a Registry so users can install it by name.

## Contents

- [Install Capsule](#install-capsule)
- [End User Quick Start](#end-user-quick-start)
- [Developer Quick Start](#developer-quick-start)
- [Project Services](#project-services)
- [Repository Layout](#repository-layout)
- [Detailed Documentation](#detailed-documentation)

## Install Capsule

Unix-like systems (Linux / macOS):

```bash
curl -fsSLo /tmp/capsule-installer "https://github.com/specterworksco/capsule/releases/latest/download/capsule-installer-$(uname -s | tr '[:upper:]' '[:lower:]'|sed 's/darwin/macos/')-$(uname -m|sed 's/x86_64/x64/;s/aarch64/arm64/')" && chmod +x /tmp/capsule-installer && /tmp/capsule-installer --yes
```

Windows PowerShell:

```powershell
$url = "https://github.com/specterworksco/capsule/releases/latest/download/capsule-installer-windows-$(@{AMD64='x64';ARM64='arm64'}[$env:PROCESSOR_ARCHITECTURE]).exe"; $tmp = "$env:TEMP\capsule-installer.exe"; Invoke-WebRequest -Uri $url -OutFile $tmp; & $tmp --yes
```

Both one-liners download the pre-compiled installer binary for your platform and run it with `--yes` (non-interactive). The installer places the `capsule` binary in `~/.capsule/bin` and adds it to your PATH automatically.

Set `CAPSULE_INSTALL_DIR` to install somewhere else, or omit `--yes` for an interactive install.

## End User Quick Start

Install the Capsule binary with the one-liner above, or build it from source:

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
capsule registry install myapp
```

You can also install directly from a `.capsule.app` URL:

```bash
capsule registry install https://example.com/myapp.capsule.app
```

Installed apps are stored under `~/.capsule/apps/`, and runnable shims are created under `~/.capsule/bin/`. Add `~/.capsule/bin` to your `PATH` if Capsule warns that it is missing.

Upgrade Capsule when a new CLI release is available:

```bash
capsule upgrade
```

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
capsule certificate request
```

Check the local certificate identity:

```bash
capsule whoami
```

Build a `.capsule.app` archive:

```bash
capsule build
```

Publish it to the Keyring and Registry:

```bash
capsule registry publish dist/myapp.capsule.app
```

Users can then install it with:

```bash
capsule registry install myapp
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
capsule build -> capsule registry publish -> Keyring /publish -> Registry /publish
```

The normal install path is:

```text
capsule registry install myapp -> Registry /resolve/myapp -> Registry /download/... -> Keyring /verify/:hash
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
