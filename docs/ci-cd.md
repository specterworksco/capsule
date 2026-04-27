# CI/CD Publishing

## Table of Contents

- [Overview](#overview)
- [Certificate Requirements](#certificate-requirements)
- [Build and Publish Steps](#build-and-publish-steps)
- [GitHub Actions Example](#github-actions-example)
- [Custom Services](#custom-services)
- [Security Notes](#security-notes)

## Overview

`capsule publish` requires a local Capsule certificate file. CI environments must provide that file before running `capsule build` or `capsule publish`.

Capsule does not currently implement a separate non-interactive certificate request command. `capsule certificates request` prompts for name and email.

## Certificate Requirements

The CLI loads the certificate from the platform store path.

On Linux CI, that path is:

```text
~/.capsule/certificate.json
```

The file must match the Keyring certificate response schema:

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

Create this certificate locally with:

```bash
capsule certificates request
```

Then store the full JSON file as a CI secret using your CI provider's secret storage.

## Build and Publish Steps

Typical CI flow:

```bash
bun install
bun run compile
mkdir -p ~/.capsule
# write certificate secret to ~/.capsule/certificate.json
chmod 600 ~/.capsule/certificate.json
./apps/cli/dist/capsule build
./apps/cli/dist/capsule publish dist/myapp.capsule.app
```

If the project uses a custom output path, publish that path instead.

Build after installing the certificate. `capsule publish` registers a signed hash, but it does not rewrite the archive to add `capsule.sig` if the archive was built unsigned.

## GitHub Actions Example

This example uses a repository secret named `CAPSULE_CERTIFICATE_JSON` containing the full certificate JSON.

```yaml
name: Publish Capsule

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - run: bun run compile

      - name: Install Capsule certificate
        run: |
          mkdir -p ~/.capsule
          printf '%s' "$CAPSULE_CERTIFICATE_JSON" > ~/.capsule/certificate.json
          chmod 600 ~/.capsule/certificate.json
        env:
          CAPSULE_CERTIFICATE_JSON: ${{ secrets.CAPSULE_CERTIFICATE_JSON }}

      - run: ./apps/cli/dist/capsule build

      - run: ./apps/cli/dist/capsule publish dist/myapp.capsule.app
```

## Custom Services

For self-hosted services, set environment variables:

```yaml
env:
  CAPSULE_KEYRING_SERVER: https://keyring.example.com
  CAPSULE_REGISTRY_SERVER: https://registry.example.com
```

Or pass flags directly:

```bash
capsule publish dist/myapp.capsule.app \
  --keyring-server https://keyring.example.com \
  --registry-server https://registry.example.com
```

## Security Notes

- Treat `certificate.json` as a signing credential.
- Do not commit `certificate.json` to source control.
- Limit CI secret access to workflows that publish releases.
- Anyone who can read the private key can publish new versions for packages owned by that certificate.
- The Keyring cannot recover a lost private key because it does not store private keys.
