# Signing and Verification

## Table of Contents

- [Trust Model](#trust-model)
- [Signing Flow](#signing-flow)
- [Publish Flow](#publish-flow)
- [Verification During Install](#verification-during-install)
- [Why Capsule Does Not Hash Raw ZIP Bytes](#why-capsule-does-not-hash-raw-zip-bytes)
- [Unsigned Capsules](#unsigned-capsules)
- [Keyring as Source of Truth](#keyring-as-source-of-truth)

## Trust Model

Capsule uses Ed25519 signatures and a Keyring Server.

The Keyring establishes that a certificate owner signed a specific Capsule content hash. The Registry uses the Keyring to decide whether a file may be published. The CLI uses the Keyring to decide whether an installed file is trusted.

Capsule signing does not sandbox code. See [Security](./security.md) for execution permissions.

## Signing Flow

### Certificate request

1. Developer runs `capsule certificate request`.
2. CLI prompts for name and email.
3. CLI calls Keyring `POST /certificates`.
4. Keyring generates an Ed25519 keypair.
5. Keyring stores only the public certificate record.
6. Keyring returns the private key once.
7. CLI writes the full certificate response to the local certificate file.

### Build signing

1. Developer runs `capsule build`.
2. CLI loads project config.
3. CLI bundles the entrypoint into `bundle.js`.
4. CLI writes `manifest.json` bytes.
5. If a local certificate exists, CLI computes the Capsule content hash.
6. CLI signs the hexadecimal hash string with the local Ed25519 private key.
7. CLI writes `capsule.sig` with `certificateId`, `signature`, and `publicKey`.

The signed files are `manifest.json` and `bundle.js`, with explicit framing. See [Capsule App Format](./capsule-app-format.md#content-hash).

## Publish Flow

1. Developer runs `capsule registry publish <file.capsule.app>`.
2. CLI reads `manifest.json` and `bundle.js` from the archive.
3. CLI recomputes the Capsule content hash.
4. CLI signs the hash with the local private key.
5. CLI calls Keyring `POST /publish` with `{ contentHash, signature, certificateId }`.
6. Keyring verifies the signature with the stored public key for the certificate.
7. Keyring stores `capsule:{contentHash}` when verification succeeds.
8. CLI calls Registry `POST /publish` with the file, same `certificateId`, and same signature.
9. Registry recomputes the content hash from the uploaded file.
10. Registry calls Keyring `GET /verify/:hash`.
11. Registry requires that Keyring returns `verified: true` and the same `certificateId`.
12. Registry stores the file and metadata.

`capsule registry publish` does not modify the archive. If the archive was built before a local certificate existed, it may be registered in the Keyring and Registry but still lack an embedded `capsule.sig` file. In that case, `capsule registry install` treats the downloaded archive as unsigned because the current verification path returns early when `capsule.sig` is missing.

## Verification During Install

`capsule registry install` verifies before installing.

1. CLI downloads a `.capsule.app` file.
2. CLI reads `manifest.json`, `bundle.js`, and optional `capsule.sig`.
3. CLI computes the Capsule content hash.
4. If `capsule.sig` is missing, the CLI warns and continues.
5. If `capsule.sig` exists, the CLI calls Keyring `GET /verify/:contentHash`.
6. If Keyring returns `verified: true`, the CLI prints the author identity and continues installing.
7. If Keyring returns `verified: false`, the CLI warns that the capsule is not trusted and continues.
8. If the Keyring request throws, the CLI attempts offline Ed25519 verification using the public key embedded in `capsule.sig`.
9. If offline verification succeeds, the CLI warns that the signature is valid but the Keyring identity could not be confirmed.
10. If offline verification fails, the CLI warns that the signature is forged or corrupt.

The current CLI warning behavior does not block installation or execution.

## Why Capsule Does Not Hash Raw ZIP Bytes

Capsule signs the content inside the archive, not the raw `.capsule.app` ZIP bytes.

The signed content is:

```text
manifest.json bytes
bundle.js bytes
```

Those bytes are framed with a domain separator and lengths before hashing.

Reasons this matters:

- ZIP metadata and compression details can vary without changing the logical app contents.
- `capsule.sig` is itself inside the ZIP. Signing the final ZIP bytes would create a self-referential file where adding the signature changes the bytes being signed.
- The manifest and bundle are the files the runner uses to execute the app.

The implemented hash covers all currently executable Capsule content. It does not cover extra archive files beyond `manifest.json` and `bundle.js`.

## Unsigned Capsules

An unsigned capsule is a valid `.capsule.app` archive without `capsule.sig`.

How unsigned capsules are created:

- Running `capsule build` without a local certificate.

How the CLI handles them:

- `capsule registry install` prints:

```text
This capsule is not signed or could not be verified. Proceed with caution.
```

- The install continues.
- `capsule run` does not perform Keyring verification in the current implementation.

## Keyring as Source of Truth

The Keyring is the authoritative record for signed content hashes.

The embedded `capsule.sig` proves that a private key signed a hash, but online Keyring verification proves that the Keyring has registered that hash for a certificate identity.

Offline verification is a fallback for availability, not a replacement for Keyring identity verification.
