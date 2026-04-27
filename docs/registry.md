# Registry Server

## Table of Contents

- [Purpose](#purpose)
- [Configuration](#configuration)
- [Endpoints](#endpoints)
- [Publish Flow](#publish-flow)
- [Package Ownership](#package-ownership)
- [KV Schema](#kv-schema)
- [R2 Storage](#r2-storage)
- [10 MB Upload Limit](#10-mb-upload-limit)
- [Known Consistency Limits](#known-consistency-limits)

## Purpose

The Registry Server stores `.capsule.app` files and lets users install apps by package name instead of direct URL.

It is implemented as a Cloudflare Worker using Hono, Cloudflare KV, and Cloudflare R2.

Responsibilities:

- Accept signed `.capsule.app` uploads.
- Validate package metadata.
- Verify signed content hashes against the Keyring Server.
- Enforce package name ownership by `certificateId`.
- Store binary archives in R2.
- Store package metadata and version metadata in KV.
- Resolve package names to download URLs.

## Configuration

The implemented Worker configuration is in `apps/registry/wrangler.toml`.

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

## Endpoints

### `GET /`

Health check.

Response:

```json
{
  "name": "capsule-registry",
  "status": "ok"
}
```

### `POST /publish`

Publish a new package version.

Request content type:

```text
multipart/form-data
```

Form fields:

| Field | Required | Type | Description |
| --- | --- | --- | --- |
| `file` | Yes | File | `.capsule.app` archive. Maximum 10 MB. |
| `certificateId` | Yes | string | UUID of the Keyring certificate. |
| `signature` | Yes | string | Base64 Ed25519 signature of the Capsule content hash. |

Success response `200`:

```json
{
  "success": true,
  "name": "myapp",
  "version": "1.0.0",
  "downloadUrl": "https://registry.usecapsule.net/download/myapp/1.0.0"
}
```

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `413` | `{ "error": "Capsule upload exceeds the 10 MB limit" }` | `Content-Length` is greater than 10 MB. |
| `400` | `{ "error": "Invalid multipart/form-data request" }` | Request body cannot be parsed as form data. |
| `400` | `{ "error": "Missing file" }` | Form field `file` is missing or not file-like. |
| `413` | `{ "error": "Capsule file exceeds the 10 MB limit" }` | Parsed file size is greater than 10 MB. |
| `400` | `{ "error": "Invalid certificateId" }` | `certificateId` is missing or not a UUID. |
| `400` | `{ "error": "Invalid signature" }` | `signature` is missing or empty. |
| `400` | Archive validation error message | ZIP, manifest, name, version, or author validation failed. |
| `403` | `{ "error": "Capsule is not signed or not registered in the keyring" }` | Keyring verification request fails or returns `verified: false`. |
| `403` | `{ "error": "Capsule was signed by a different publisher certificate" }` | Keyring record certificate does not match submitted `certificateId`. |
| `403` | `{ "error": "Package name owned by another publisher" }` | Existing package owner certificate differs. |
| `409` | `{ "error": "Package version already exists" }` | `app:{name}:{version}` already exists. |

### `GET /resolve/:name`

Resolve a package name to its latest version.

Path params:

| Param | Validation |
| --- | --- |
| `name` | Must match `^[a-z0-9][a-z0-9-]{0,63}$`. |

Success response `200`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "downloadUrl": "https://registry.usecapsule.net/download/myapp/1.0.0",
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  },
  "hash": "64-character-sha256-hex"
}
```

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid package name" }` | Name does not match Registry naming rules. |
| `404` | `{ "error": "Unknown package" }` | `app:{name}` is missing. |
| `500` | `{ "error": "Package metadata is incomplete" }` | App metadata exists but latest version metadata is missing. |

### `GET /resolve/:name/:version`

Resolve a package name and specific version.

Path params:

| Param | Validation |
| --- | --- |
| `name` | Must match `^[a-z0-9][a-z0-9-]{0,63}$`. |
| `version` | Must match `^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$`. |

Success response `200` has the same shape as `GET /resolve/:name`, but `version` is the requested version.

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid package name" }` | Name does not match Registry naming rules. |
| `400` | `{ "error": "Invalid package version" }` | Version does not match Registry version rules. |
| `404` | `{ "error": "Unknown package" }` | `app:{name}` is missing. |
| `404` | `{ "error": "Unknown package version" }` | `app:{name}:{version}` is missing. |

### `GET /download/:name/:version`

Stream a `.capsule.app` file from R2.

Path params:

| Param | Validation |
| --- | --- |
| `name` | Must match `^[a-z0-9][a-z0-9-]{0,63}$`. |
| `version` | Must match `^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$`. |

Success response:

- Status: `200`
- Body: R2 object stream
- `content-type`: R2 object content type, or `application/vnd.capsule.app`
- `etag`: R2 object HTTP ETag

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid package name" }` | Name does not match Registry naming rules. |
| `400` | `{ "error": "Invalid package version" }` | Version does not match Registry version rules. |
| `404` | `{ "error": "Unknown package version" }` | Version metadata is missing. |
| `500` | `{ "error": "Package file is missing" }` | Version metadata exists but R2 object is missing. |

### `GET /apps/:name`

Return public package metadata.

Path params:

| Param | Validation |
| --- | --- |
| `name` | Must match `^[a-z0-9][a-z0-9-]{0,63}$`. |

Success response `200`:

```json
{
  "name": "myapp",
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  },
  "latestVersion": "1.0.0",
  "versions": [
    {
      "version": "1.0.0",
      "hash": "64-character-sha256-hex",
      "publishedAt": "2026-04-27T00:00:00.000Z"
    }
  ]
}
```

Versions are sorted by `publishedAt` descending.

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid package name" }` | Name does not match Registry naming rules. |
| `404` | `{ "error": "Unknown package" }` | `app:{name}` is missing. |

## Publish Flow

`POST /publish` performs these steps:

1. Rejects early when `Content-Length` is greater than 10 MB.
2. Parses the request as multipart form data.
3. Validates `file`, `certificateId`, and `signature`.
4. Rejects if the parsed file size is greater than 10 MB.
5. Reads the file into memory.
6. Reads the ZIP and extracts `manifest.json` and `bundle.js`.
7. Validates manifest fields required by the Registry.
8. Computes the Capsule content hash.
9. Calls Keyring `GET /verify/:hash` using `KEYRING_SERVER`.
10. Requires `verified: true` from Keyring.
11. Requires the Keyring `certificateId` to match the submitted `certificateId`.
12. Checks package ownership in KV.
13. Rejects if the exact version already exists.
14. Uploads the archive to R2.
15. Writes version metadata to KV.
16. Writes or updates app metadata in KV.
17. Returns the package name, version, and download URL.

## Package Ownership

The first successful publish of a package name reserves that name for the publishing `certificateId`.

Rules:

- If `app:{name}` does not exist, the submitted certificate becomes the owner.
- If `app:{name}` exists, future publishes must use the same `certificateId`.
- The Registry also checks that the Keyring verification response for the hash contains the same `certificateId`.
- Versions are immutable. Publishing the same `{name, version}` again returns `409`.

`latestVersion` is updated only when the newly published version is greater than or equal to the existing latest version according to the implemented numeric comparison of major, minor, and patch.

## KV Schema

All Registry metadata is stored in the `CAPSULE_REGISTRY` KV namespace.

| Key | Value | Purpose |
| --- | --- | --- |
| `app:{name}` | `{ latestVersion, certificateId, author, createdAt, updatedAt }` | Package-level metadata and ownership. |
| `app:{name}:{version}` | `{ r2Key, hash, publishedAt }` | Immutable version metadata. |

## R2 Storage

Capsule archives are stored in the `CAPSULE_APPS` R2 bucket.

R2 key pattern:

```text
apps/{name}/{version}.capsule.app
```

R2 objects are uploaded with content type:

```text
application/vnd.capsule.app
```

## 10 MB Upload Limit

The hard upload limit is 10 MB.

The Registry enforces it in two places:

- Before parsing form data, if `Content-Length` is present and greater than `10 * 1024 * 1024`.
- After parsing form data, by checking the uploaded file's `size`.

The file is currently read into memory after these checks.

## Known Consistency Limits

The Registry uses KV for package ownership and version metadata. KV does not provide atomic compare-and-set in this implementation.

Two first-time publishes for the same package name can race if they happen concurrently before KV propagates. This implementation does not use Durable Objects, D1, or locks to prevent that race.
