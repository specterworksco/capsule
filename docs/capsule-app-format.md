# Capsule App Format

## Table of Contents

- [Overview](#overview)
- [ZIP Structure](#zip-structure)
- [`manifest.json`](#manifestjson)
- [`capsule.sig`](#capsulesig)
- [Content Hash](#content-hash)
- [Signing](#signing)
- [Validation](#validation)

## Overview

A `.capsule.app` file is a ZIP archive created by the Capsule CLI. It contains an application bundle, a manifest, and optionally a signature file.

The archive is read with `fflate` by both the CLI and Registry Server.

## ZIP Structure

Current archives produced by `capsule build` contain:

```text
<name>.capsule.app
+-- manifest.json
+-- bundle.js
`-- capsule.sig      # present only when a local certificate exists at build time
```

| File | Required | Purpose |
| --- | --- | --- |
| `manifest.json` | Yes | Capsule app metadata. |
| `bundle.js` | Yes | Bundled application code. |
| `capsule.sig` | No | Ed25519 signature metadata for the content hash. |

The CLI installer writes every file from the archive into the installed app directory.

## `manifest.json`

The manifest schema is defined in `packages/shared/src/index.ts`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Application/package name. The shared manifest schema only requires a non-empty string. Registry publishing applies stricter package-name rules. |
| `version` | `string` | Yes | Application version. The shared manifest schema only requires a non-empty string. Registry publishing applies stricter version rules. |
| `author` | `string` | No | Human-readable author string. Registry publishing rejects manifests where this is missing or empty. |
| `description` | `string` | No | Human-readable description. |
| `entry` | literal `bundle.js` | Yes | Bundle entry file inside the archive. The CLI always writes `bundle.js`. |

Example:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "author": "Jane Dev <jane@example.com>",
  "description": "Example app",
  "entry": "bundle.js"
}
```

Registry-specific validation during publish:

| Field | Rule |
| --- | --- |
| `name` | Must match `^[a-z0-9][a-z0-9-]{0,63}$`. |
| `version` | Must match `^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$`. |
| `author` | Must be present and contain non-whitespace text. |

## `capsule.sig`

The signature schema is defined in `packages/shared/src/keyring.ts`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `certificateId` | UUID string | Yes | Keyring certificate used to sign the content hash. |
| `signature` | string | Yes | Base64 Ed25519 signature of the content hash string. |
| `publicKey` | string | Yes | Base64 raw Ed25519 public key. Used by offline verification. |

Example shape:

```json
{
  "certificateId": "11111111-1111-4111-8111-111111111111",
  "signature": "base64-signature",
  "publicKey": "base64-public-key"
}
```

`capsule.sig` is optional at the file format level. Unsigned capsules can still be installed and run, but the CLI warns the user.

## Content Hash

Capsule does not hash the raw ZIP bytes. It hashes the internal `manifest.json` bytes and `bundle.js` bytes with a domain separator and explicit length prefixes.

The implemented algorithm is:

```text
SHA256(
  utf8("capsule-content-v1") ||
  uint64_be(manifestBytes.length) ||
  manifestBytes ||
  uint64_be(bundleBytes.length) ||
  bundleBytes
)
```

The resulting digest is encoded as lowercase hexadecimal.

The domain separator and length prefixes are part of the signed data. They prevent ambiguous concatenation of manifest and bundle bytes.

## Signing

`capsule build` signs automatically if a local certificate exists.

Signing steps:

1. Read `manifest.json` bytes and `bundle.js` bytes.
2. Compute the content hash described above.
3. Import the local private key as `pkcs8` Ed25519.
4. Sign the UTF-8 bytes of the 64-character hexadecimal hash string.
5. Store the base64 signature in `capsule.sig`.

`capsule publish` repeats the same content hash computation and signs the hash again before sending it to the Keyring and Registry.

`capsule publish` does not rewrite the archive. The only implemented command that embeds `capsule.sig` is `capsule build`, and only when a local certificate exists at build time.

## Validation

The CLI archive reader requires:

- A valid ZIP archive.
- `manifest.json` to exist and parse as the shared manifest schema.
- `bundle.js` to exist.
- `capsule.sig`, when present, to parse as the shared signature schema.

Registry publishing additionally requires:

- File size not greater than 10 MB.
- Registry-valid package name.
- Registry-valid version.
- Non-empty manifest author.
- Hash verification through the configured Keyring Server.
