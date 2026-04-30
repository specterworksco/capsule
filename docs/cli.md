# Capsule CLI Reference

## Overview

The Capsule CLI builds `.capsule.app` archives, manages local signing certificates, publishes packages to the Registry, installs packages from the Registry, downloads raw archives, and runs local bundles.

The CLI is implemented in `apps/cli` and can be compiled with:

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

Printed messages can include:

```text
✓ Built <outputPath>
! No certificate found - capsule will be unsigned. Run `capsule certificate request` to get one.
→ Run capsule certificate request to sign future builds.
```

### `capsule certificate request`

Request a new signing certificate from the Keyring Server.

```bash
capsule certificate request [--keyring-server <url>]
```

Printed messages can include:

```text
✓ Certificate issued: <certificateId>
! Your private key is stored at <certificatePath> - keep this file safe. It cannot be recovered if lost.
```

### `capsule certificate revoke`

Revoke the locally installed certificate.

```bash
capsule certificate revoke [--transfer-to <certificateId>] [--keyring-server <url>] [--registry-server <url>]
```

Behavior:

- Loads the local `certificate.json`.
- Lists packages currently owned by that certificate in the Registry.
- If owned packages exist, transfers them to `--transfer-to` or prompts for a destination certificate ID.
- Sends a signed revoke request to the Keyring.
- Removes the local `certificate.json` after successful revocation.

Printed messages can include:

```text
✓ Revoked certificate <certificateId>
✓ Transferred <count> package(s) to <replacementCertificateId>
```

### `capsule whoami`

Show the identity for the locally installed certificate.

```bash
capsule whoami [--keyring-server <url>]
```

Behavior:

- Prints local certificate name, email, certificate ID, issue date, and file path.
- Checks the Keyring public certificate record.
- Warns if the local public key differs from the Keyring record.
- Warns if the certificate has been revoked.

### `capsule upgrade`

Upgrade the Capsule CLI to the latest GitHub release.

```bash
capsule upgrade [--target <bun-target>] [--variant <variant>] [--install-dir <dir>] [--force]
```

Behavior:

- Checks `https://github.com/specterworksco/capsule` for the latest release.
- Selects the release asset for the current platform by default.
- Downloads and installs the binary to `~/.capsule/bin/capsule` or `--install-dir`.
- `--target` installs an exact Bun compile target asset.
- `--variant` selects a platform variant such as `baseline`, `modern`, or `musl`.
- `--force` reinstalls the latest release even when the current version is already up to date.

Running `capsule` without arguments also checks for updates and prints a best-effort notice when a newer release exists.

### `capsule registry publish <file.capsule.app>`

Register a signed capsule with the Keyring and publish it to the Registry.

```bash
capsule registry publish <file.capsule.app> [--keyring-server <url>] [--registry-server <url>]
```

Printed messages on success:

```text
✓ Signed and registered as <author name>
✓ Published to registry: capsule registry install <name>
```

### `capsule registry info <name>`

Show public Registry metadata for a package.

```bash
capsule registry info <name> [--registry-server <url>]
```

Behavior:

- For active packages, prints current owner and published versions.
- For tombstoned packages, prints the tombstone state and tombstone message.

### `capsule registry install <target>`

Download, verify, and install a capsule app.

```bash
capsule registry install <package-name-or-url> [--keyring-server <url>] [--registry-server <url>]
```

Behavior:

- If the target is a package name, resolves it through the Registry.
- If the package is tombstoned, the install aborts.
- If the target is a URL, downloads it directly.
- Verifies the downloaded archive with the Keyring when possible.
- Installs all archive files into the local app directory.
- Creates a runnable shim under the local bin directory.

Printed messages can include:

```text
• Resolved <name>@<version>
✓ Signed by <author name> (<author email>)
✓ Installed <name>@<version>
! Add <binDir> to your PATH to run installed apps by name.
```

### `capsule registry download <target>`

Download a `.capsule.app` archive without installing it.

```bash
capsule registry download <package-name-or-url> [--output <path>] [--registry-server <url>]
capsule registry download <package-name-or-url> [-o <path>] [--registry-server <url>]
```

Behavior:

- If the target is a package name, resolves it through the Registry.
- If the package is tombstoned, the download aborts.
- Saves to `./<name>-<version>.capsule.app` by default for Registry names.
- Saves to the URL filename by default for direct URLs.

Printed messages can include:

```text
✓ Downloaded <outputPath>
```

### `capsule registry remove <name>`

Tombstone a package you own.

```bash
capsule registry remove <name> [--registry-server <url>]
```

Behavior:

- Signs the remove request with the local private key.
- Requires the local certificate to be the current owner.
- Deletes all package archives from R2.
- Deletes all immutable version metadata.
- Leaves a package tombstone so the name cannot be reused.

Printed messages can include:

```text
✓ Removed <name>
! Este paquete fue deprecado intencionalmente, no es posible obtenerlo.
```

### `capsule registry transfer <name> --to <certificateId>`

Transfer ownership of a package you own.

```bash
capsule registry transfer <name> --to <certificateId> [--registry-server <url>]
```

Behavior:

- Signs the transfer request with the local private key.
- Requires the local certificate to be the current owner.
- Requires the destination certificate to exist and remain active.
- Updates package ownership for future publishes and owner listings.

### `capsule run <file.capsule.app> [app args...]`

Run a local `.capsule.app` archive without installing it.

```bash
capsule run <file.capsule.app> [app args...]
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

## Network Interactions

| CLI action | Endpoint called |
| --- | --- |
| `certificate request` | Keyring `POST /certificates` |
| `certificate revoke` | Registry `GET /owners/:certificateId/apps` |
| `certificate revoke` | Registry `POST /apps/:name/transfer` |
| `certificate revoke` | Keyring `POST /certificates/:certificateId/revoke` |
| `whoami` | Keyring `GET /certificates/:certificateId` |
| `upgrade` | GitHub `GET /repos/specterworksco/capsule/releases/latest` |
| `registry publish` | Keyring `POST /publish` |
| `registry publish` | Registry `POST /publish` |
| `registry install` | Registry `GET /resolve/:name` when target is a name |
| `registry install` | Registry `GET /download/:name/:version` indirectly via `downloadUrl` |
| `registry install` | Keyring `GET /verify/:contentHash` |
| `registry download` | Registry `GET /resolve/:name` when target is a name |
| `registry info` | Registry `GET /apps/:name` |
| `registry remove` | Registry `POST /apps/:name/remove` |
| `registry transfer` | Registry `POST /apps/:name/transfer` |

## Tombstones

Removing a package does not free the package name.

When a package is tombstoned:

- `capsule registry info` still shows the package and its tombstone state.
- `capsule registry install` aborts.
- `capsule registry download` aborts.
- The Registry keeps the name reserved.
- Version objects are deleted from R2.

## Environment Variables

| Variable | Used by | Description |
| --- | --- | --- |
| `CAPSULE_KEYRING_SERVER` | CLI | Default Keyring Server URL when `--keyring-server` is not provided. |
| `CAPSULE_REGISTRY_SERVER` | CLI | Default Registry Server URL when `--registry-server` is not provided. |
| `PATH` | CLI install flow | Used to warn when the Capsule bin directory is not on the PATH. |
| `APPDATA` | CLI on Windows | Used to resolve the store root. |
