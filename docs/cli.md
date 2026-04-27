# Capsule CLI Reference

## Table of Contents

- [Overview](#overview)
- [Commands](#commands)
- [Local Data](#local-data)
- [Network Interactions](#network-interactions)
- [Errors and Exit Codes](#errors-and-exit-codes)
- [Environment Variables](#environment-variables)

## Overview

The Capsule CLI builds `.capsule.app` ZIP archives, requests signing certificates, publishes archives to the Keyring and Registry, installs apps, and runs installed bundles.

The CLI is implemented in `apps/cli` and can be compiled to a native executable with:

```bash
bun run compile
```

The compiled binary is written to `apps/cli/dist/capsule` on Unix-like systems and `apps/cli/dist/capsule.exe` on Windows.

## Commands

### `capsule build`

Build the current project into a `.capsule.app` archive.

```bash
capsule build [--output <path>]
capsule build [-o <path>]
```

| Argument or flag | Required | Description |
| --- | --- | --- |
| `--output <path>` | No | Output file path. |
| `-o <path>` | No | Alias for `--output`. |

Behavior:

- Loads project configuration from `capsule.config.ts` if it exists.
- Falls back to `package.json` if there is no `capsule.config.ts`.
- Bundles the configured entrypoint with `Bun.build` using `target: "bun"` and `format: "esm"`.
- Writes `manifest.json` and `bundle.js` into a ZIP archive.
- If the local certificate file exists, signs the content hash and writes `capsule.sig` into the archive.
- Defaults the output path to `dist/{manifest.name}.capsule.app`.

Examples:

```bash
capsule build
capsule build --output ./release/myapp.capsule.app
```

Printed messages:

```text
Built <outputPath>
No certificate found - capsule will be unsigned. Run `capsule certificates request` to get one.
```

The warning is printed only when no local certificate is found.

### `capsule certificates request`

Request a new signing certificate from the Keyring Server.

```bash
capsule certificates request [--keyring-server <url>]
```

| Argument or flag | Required | Description |
| --- | --- | --- |
| `--keyring-server <url>` | No | Keyring Server base URL. Defaults to `CAPSULE_KEYRING_SERVER` or `https://keyring.usecapsule.net`. |

Behavior:

- Prompts for `Name:` and `Email:`.
- Sends `POST /certificates` to the configured Keyring Server.
- Stores the returned certificate JSON at the local certificate path.
- Sets file mode `0600` when possible.

Examples:

```bash
capsule certificates request
capsule certificates request --keyring-server http://localhost:8787
```

Printed messages:

```text
Certificate issued: <certificateId>
Your private key is stored at <certificatePath> - keep this file safe. It cannot be recovered if lost.
```

### `capsule publish <file.capsule.app>`

Register a signed capsule with the Keyring Server and publish it to the Registry Server.

```bash
capsule publish <file.capsule.app> [--keyring-server <url>] [--registry-server <url>]
```

| Argument or flag | Required | Description |
| --- | --- | --- |
| `<file.capsule.app>` | Yes | Path to the capsule archive. |
| `--keyring-server <url>` | No | Keyring Server base URL. |
| `--registry-server <url>` | No | Registry Server base URL. |

Behavior:

- Loads the local certificate from `certificate.json`.
- Reads the capsule archive and extracts `manifest.json` and `bundle.js`.
- Computes the Capsule content hash.
- Signs the content hash with the local private key.
- Sends the hash, signature, and `certificateId` to Keyring `POST /publish`.
- If Keyring publishing succeeds, sends multipart form data to Registry `POST /publish` with the file, `certificateId`, and same signature.
- Does not rewrite the `.capsule.app` file. If the archive was built without `capsule.sig`, publishing registers the hash but does not add an embedded signature to the uploaded file.

Examples:

```bash
capsule publish dist/myapp.capsule.app
capsule publish dist/myapp.capsule.app --registry-server http://localhost:8788
```

Printed messages on success:

```text
Signed and registered as <author name>
Published to registry: capsule get <name>
```

Known errors thrown by the CLI before network requests:

```text
Missing .capsule.app file
No certificate found. Run `capsule certificates request` first.
```

### `capsule get <target>`

Download, verify, and install a capsule app.

```bash
capsule get <package-name-or-url> [--keyring-server <url>] [--registry-server <url>]
```

| Argument or flag | Required | Description |
| --- | --- | --- |
| `<package-name-or-url>` | Yes | Registry package name or direct URL to a `.capsule.app` archive. |
| `--keyring-server <url>` | No | Keyring Server used during verification. |
| `--registry-server <url>` | No | Registry Server used when the target is not a URL. |

Behavior:

- If the target is a valid URL, downloads it directly.
- If the target is not a valid URL, calls Registry `GET /resolve/:name`, then downloads the returned `downloadUrl`.
- Verifies the downloaded capsule with the Keyring when possible.
- Falls back to offline signature verification if the Keyring request fails and `capsule.sig` exists.
- Installs all archive files into the local app directory.
- Creates a runnable shim under the local bin directory.

Examples:

```bash
capsule get myapp
capsule get https://example.com/myapp.capsule.app
capsule get myapp --registry-server http://localhost:8788
```

Printed messages can include:

```text
Resolved <name>@<version>
Signed by <author name> (<author email>)
Installed <name>@<version>
Add <binDir> to your PATH to run installed apps by name.
```

Warnings can include:

```text
This capsule is not signed or could not be verified. Proceed with caution.
This capsule is not trusted by the Keyring registry. Proceed with caution.
Offline verification successful. Keyring server unreachable, cannot confirm author identity.
Signature is forged or corrupt. Proceed with caution.
```

### `capsule run <file.capsule.app> [app args...]`

Run a local `.capsule.app` archive without installing it.

```bash
capsule run <file.capsule.app> [app args...]
```

| Argument | Required | Description |
| --- | --- | --- |
| `<file.capsule.app>` | Yes | Path to a local capsule archive. |
| `[app args...]` | No | Arguments passed to the app bundle. |

Behavior:

- Reads and validates the capsule archive.
- Extracts archive files into a temporary directory under the OS temp directory using a `capsule-` prefix.
- Imports the extracted bundle with `await import(...)`.
- Restores `process.argv` after execution.
- Removes the temporary directory after the bundle finishes or throws.

Example:

```bash
capsule run dist/myapp.capsule.app -- --help
```

Known error:

```text
Missing .capsule.app file
```

### `capsule info <name>`

Show public Registry metadata for a package.

```bash
capsule info <name> [--registry-server <url>]
```

| Argument or flag | Required | Description |
| --- | --- | --- |
| `<name>` | Yes | Registry package name. |
| `--registry-server <url>` | No | Registry Server base URL. |

Behavior:

- Calls Registry `GET /apps/:name`.
- Prints the latest version, author, and version publication dates.

Example:

```bash
capsule info myapp
```

Known error:

```text
Missing package name
```

### `capsule __run <bundle> [app args...]`

Internal command used by generated shims.

```bash
capsule __run <bundle> [app args...]
```

This command is hidden from normal help output. It imports an already-extracted `bundle.js` file and passes through app arguments.

Known error:

```text
Missing bundle path
```

## Local Data

Capsule stores local state in a platform-specific root directory.

| Platform | Store root |
| --- | --- |
| Unix-like | `~/.capsule` |
| Windows | `%APPDATA%\capsule` if `APPDATA` is set, otherwise `%USERPROFILE%\AppData\Roaming\capsule` |

Structure:

```text
~/.capsule/
+-- apps/
|   `-- <app-name>/
|       +-- manifest.json
|       +-- bundle.js
|       `-- capsule.sig
+-- bin/
|   `-- <app-name>
`-- certificate.json
```

On Windows, shims are created as `.cmd` files:

```text
%APPDATA%\capsule\bin\<app-name>.cmd
```

Unix shim behavior:

- The CLI first tries to create a hardlink from the current Capsule binary to `~/.capsule/bin/<app-name>`.
- If hardlink creation fails, it writes a shell script that runs `capsule __run <bundle>`.

Windows shim behavior:

- The CLI writes a `.cmd` wrapper that runs `capsule __run <bundle>`.

## Network Interactions

| CLI action | Endpoint called | When |
| --- | --- | --- |
| `certificates request` | Keyring `POST /certificates` | After collecting name and email. |
| `publish` | Keyring `POST /publish` | Before Registry publish, to register the signed hash. |
| `publish` | Registry `POST /publish` | After Keyring publish succeeds. |
| `get <name>` | Registry `GET /resolve/:name` | When target is not a URL. |
| `get <name>` | Registry `GET /download/:name/:version` | Indirectly, by downloading the `downloadUrl` returned by resolve. |
| `get` | Keyring `GET /verify/:contentHash` | After download, before install. |
| `info` | Registry `GET /apps/:name` | To print Registry metadata. |

## Errors and Exit Codes

The CLI does not define custom numeric exit codes. Commands throw errors on failure, and the `citty` command runner handles process termination.

Errors are plain messages from the failing command, parser, filesystem operation, `Bun.build`, `fetch`, or schema validation.

Examples of explicit CLI error messages:

| Message | Source |
| --- | --- |
| `Missing .capsule.app file` | `publish` and `run` command argument validation. |
| `Missing package name or URL` | `get` command argument validation. |
| `Missing package name` | `info` command argument validation. |
| `No certificate found. Run \`capsule certificates request\` first.` | `publish` when no local certificate exists. |
| `Invalid keyring server URL: <url>` | Keyring URL resolution. |
| `Invalid registry server URL: <url>` | Registry URL resolution. |
| `Download failed: <status> <statusText>` | Direct download helper. |
| `Keyring request failed: <status> <body>` | Keyring JSON POST helper. |
| `Registry publish failed: <status> <body>` | Registry publish helper. |
| `Registry resolve failed: <status> <body>` | Registry resolve helper. |
| `Registry info failed: <status> <body>` | Registry info helper. |

## Environment Variables

| Variable | Used by | Description |
| --- | --- | --- |
| `CAPSULE_KEYRING_SERVER` | CLI | Default Keyring Server URL when `--keyring-server` is not provided. |
| `CAPSULE_REGISTRY_SERVER` | CLI | Default Registry Server URL when `--registry-server` is not provided. |
| `PATH` | CLI install flow | Used to warn when the Capsule bin directory is not on the PATH. |
| `APPDATA` | CLI on Windows | Used to resolve the store root. |

Default service URLs are:

```text
https://keyring.usecapsule.net
https://registry.usecapsule.net
```
