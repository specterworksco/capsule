# Keyring Server

## Table of Contents

- [Purpose](#purpose)
- [Configuration](#configuration)
- [Endpoints](#endpoints)
- [Certificate Lifecycle](#certificate-lifecycle)
- [KV Schema](#kv-schema)
- [Rate Limiting](#rate-limiting)
- [What Is Never Persisted](#what-is-never-persisted)

## Purpose

The Keyring Server is the trust source for Capsule signatures. It issues Ed25519 certificates and records which content hashes were signed by which certificate.

It does not store `.capsule.app` files. File storage is handled by the Registry Server.

The Keyring implementation is a Cloudflare Worker using Hono and Cloudflare KV.

## Configuration

The implemented Worker configuration is in `apps/keyring/wrangler.toml`.

```toml
name = "capsule-keyring"
main = "src/index.ts"
compatibility_date = "2026-04-26"

routes = [
  { pattern = "keyring.usecapsule.net", custom_domain = true }
]

[[kv_namespaces]]
binding = "CAPSULE_KEYRING"
id = "7068aa43c243449a87b73fd670b0e24b"
preview_id = "7068aa43c243449a87b73fd670b0e24b"

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
  "name": "capsule-keyring",
  "status": "ok"
}
```

### `POST /certificates`

Issue a new signing certificate.

Request body:

```json
{
  "name": "Jane Dev",
  "email": "jane@example.com"
}
```

Request schema:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `name` | string | Yes | Minimum length 1. |
| `email` | string | Yes | Must be a valid email. |

Success response `200`:

```json
{
  "certificateId": "uuid",
  "publicKey": "base64-raw-ed25519-public-key",
  "privateKey": "base64-pkcs8-ed25519-private-key",
  "issuedAt": "2026-04-27T00:00:00.000Z",
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  }
}
```

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid certificate request" }` | Body does not match the certificate request schema. |
| `429` | `{ "error": "Certificate limit reached for this email" }` | The normalized email already has 3 certificates. |

### `POST /publish`

Register a signed content hash.

Request body:

```json
{
  "contentHash": "64-character-sha256-hex",
  "signature": "base64-signature",
  "certificateId": "uuid"
}
```

Request schema:

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| `contentHash` | string | Yes | Must match `^[a-f0-9]{64}$`. |
| `signature` | string | Yes | Minimum length 1. |
| `certificateId` | string | Yes | UUID. |

Success response `200`:

```json
{
  "success": true,
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  }
}
```

Errors:

| Status | Body | Cause |
| --- | --- | --- |
| `400` | `{ "error": "Invalid publish request" }` | Body does not match the publish request schema. |
| `404` | `{ "error": "Unknown certificate" }` | `certificateId` does not exist in KV. |
| `400` | `{ "error": "Invalid signature" }` | Ed25519 verification fails for the hash and certificate public key. |

### `GET /verify/:contentHash`

Verify whether a content hash is registered in the Keyring.

Path params:

| Param | Validation |
| --- | --- |
| `contentHash` | Must match `^[a-f0-9]{64}$`. |

Success response for a registered hash `200`:

```json
{
  "verified": true,
  "certificateId": "uuid",
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  },
  "publishedAt": "2026-04-27T00:00:00.000Z",
  "publicKey": "base64-raw-ed25519-public-key"
}
```

Response for an unknown hash `200`:

```json
{
  "verified": false
}
```

Response for an invalid hash `400`:

```json
{
  "verified": false
}
```

## Certificate Lifecycle

1. Developer runs `capsule certificates request`.
2. CLI sends name and email to `POST /certificates`.
3. Keyring generates an Ed25519 keypair with WebCrypto.
4. Keyring stores only the certificate ID, public key, author, and issue time.
5. Keyring returns the private key once in the response.
6. CLI stores the full response at the local certificate path.
7. Future `capsule build` and `capsule publish` calls use the local private key to sign content hashes.

## KV Schema

All Keyring data is stored in the `CAPSULE_KEYRING` KV namespace.

| Key | Value | Purpose |
| --- | --- | --- |
| `cert:{certificateId}` | `{ certificateId, publicKey, author, issuedAt }` | Public certificate record. |
| `cert-count:{normalizedEmail}` | Number as string | Certificate count per lowercased email. |
| `capsule:{contentHash}` | `{ certificateId, author, publicKey, publishedAt }` | Registered signed hash. |

Email normalization trims and lowercases the email address.

## Rate Limiting

Certificate issuance is limited to 3 certificates per normalized email address.

This is implemented with KV using `cert-count:{email}`. KV does not provide transactional increments in this implementation, so highly concurrent requests for the same email may race.

## What Is Never Persisted

The private key is not stored by the Keyring Server.

It is returned only in the successful `POST /certificates` response and then stored locally by the CLI in `certificate.json`.
