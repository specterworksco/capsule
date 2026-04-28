# Registry Server

## Purpose

The Registry Server stores `.capsule.app` files and package metadata.

Responsibilities:

- Accept signed package uploads.
- Resolve package names to downloads.
- Store immutable version files in R2.
- Track current package ownership by certificate.
- Tombstone packages.
- Transfer ownership between active certificates.

## Public Endpoints

### `POST /publish`

Publish a new package version.

Requirements:

- The uploaded archive must be valid.
- The Keyring must already recognize the content hash.
- The publishing certificate must match the Keyring record.
- The publishing certificate must not be revoked.
- The package must not be tombstoned.
- If the package already exists, the certificate must still own it.

### `GET /resolve/:name`

Resolve a package name to its latest version.

Responses:

- `200` with an active package payload.
- `410` with a tombstone payload when the package was intentionally removed.

### `GET /download/:name/:version`

Download an archive from R2.

If the package is tombstoned, the endpoint returns `410` and the tombstone message.

### `GET /apps/:name`

Return package metadata.

Responses:

- `200` active package metadata with `latestVersion` and `versions`.
- `200` tombstone metadata with `state: "tombstoned"` and `tombstoneMessage`.

## Ownership Endpoints

### `POST /apps/:name/remove`

Tombstone a package.

Behavior:

- Requires a request signed by the current owner certificate.
- Deletes all package archives from R2.
- Deletes all immutable version keys from KV.
- Leaves `app:{name}` in a tombstoned state.
- Removes the package from the owner index.

### `POST /apps/:name/transfer`

Transfer a package to another active certificate.

Behavior:

- Requires a request signed by the current owner certificate.
- Requires the destination certificate to exist and remain active.
- Updates package ownership metadata.
- Moves the owner index entry.

### `GET /owners/:certificateId/apps`

List currently owned package names for a certificate.

This only lists active owned packages. Tombstoned packages are removed from the owner index.

## Tombstones

Tombstoning is permanent package retirement.

When a package is tombstoned:

- The package name stays reserved.
- New publishes for that package name are rejected.
- The Registry returns the tombstone message on resolve and download attempts.
- Version metadata is removed.
- R2 archive objects are deleted.

Default tombstone message:

```text
Este paquete fue deprecado intencionalmente, no es posible obtenerlo.
```

## Storage

### KV

| Key | Value |
| --- | --- |
| `app:{name}` | Active or tombstoned package metadata |
| `app:{name}:{version}` | Immutable version metadata `{ r2Key, hash, publishedAt }` |
| `owner:{certificateId}:{name}` | Owner index marker |

### R2

Version archives are stored as:

```text
apps/{name}/{version}.capsule.app
```

## Notes

- The Registry tracks current owner certificate state separately from historical signature provenance.
- Old versions remain signed by the certificate that originally published them, even after ownership transfer.
- The current implementation still uses KV and R2 without transactional guarantees for multi-step mutations.
