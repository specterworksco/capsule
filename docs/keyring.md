# Keyring Server

## Purpose

The Keyring Server is Capsule's trust source.

Responsibilities:

- Issue Ed25519 certificates.
- Publish signed content hashes.
- Verify published content hashes.
- Expose public certificate records.
- Revoke certificates.

The Keyring never stores private keys.

## Endpoints

### `POST /certificates`

Issue a new certificate.

Request body:

```json
{
  "name": "Jane Dev",
  "email": "jane@example.com"
}
```

Success response:

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

### `GET /certificates/:certificateId`

Return a public certificate record.

Success response:

```json
{
  "certificateId": "uuid",
  "publicKey": "base64-raw-ed25519-public-key",
  "issuedAt": "2026-04-27T00:00:00.000Z",
  "author": {
    "name": "Jane Dev",
    "email": "jane@example.com"
  },
  "revokedAt": "2026-04-28T00:00:00.000Z",
  "replacedByCertificateId": "uuid"
}
```

`revokedAt` and `replacedByCertificateId` are omitted when the certificate remains active.

### `POST /certificates/:certificateId/revoke`

Revoke an existing certificate.

Request body:

```json
{
  "replacementCertificateId": "uuid",
  "issuedAt": "2026-04-27T00:00:00.000Z",
  "signature": "base64-signature"
}
```

Behavior:

- Validates the request body.
- Loads the source certificate.
- Optionally validates the replacement certificate when provided.
- Verifies the signed revoke payload with the source certificate public key.
- Marks the source certificate as revoked.

### `POST /publish`

Register a signed content hash.

The Keyring rejects publishes from revoked certificates.

### `GET /verify/:contentHash`

Verify whether a content hash is registered.

For registered hashes, the response includes:

- `certificateId`
- `author`
- `publishedAt`
- `publicKey`
- optional `revokedAt`
- optional `replacedByCertificateId`

## Certificate Lifecycle

1. A developer requests a certificate.
2. The Keyring generates an Ed25519 keypair.
3. The public certificate record is stored in KV.
4. The private key is returned once to the CLI.
5. The CLI stores it locally in `certificate.json`.
6. Later, the certificate can be revoked with a signed revoke request.

## KV Schema

| Key | Value |
| --- | --- |
| `cert:{certificateId}` | `{ certificateId, publicKey, author, issuedAt, revokedAt?, replacedByCertificateId? }` |
| `cert-count:{normalizedEmail}` | Number as string |
| `capsule:{contentHash}` | `{ certificateId, author, publicKey, publishedAt }` |

## Notes

- Revoking a certificate does not rewrite historical capsule signatures.
- Historical content hashes remain associated with the certificate that originally signed them.
- Revocation only blocks future publication and exposes revocation status to verifiers.
