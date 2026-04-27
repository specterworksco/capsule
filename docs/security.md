# Security and Sandboxing

## Table of Contents

- [Overview](#overview)
- [No Sandbox](#no-sandbox)
- [What Signatures Prove](#what-signatures-prove)
- [What Signatures Do Not Prove](#what-signatures-do-not-prove)
- [Unsigned and Untrusted Apps](#unsigned-and-untrusted-apps)
- [Private Key Handling](#private-key-handling)
- [Operational Risks](#operational-risks)

## Overview

Capsule currently provides signing and identity verification for app archives. It does not provide execution sandboxing.

For the full signing flow, see [Signing and Verification](./signing-and-verification.md).

## No Sandbox

Capsule apps run with the permissions of the user who runs them.

The current runner imports the bundled JavaScript file into the Capsule process:

```ts
await import(bundleUrl)
```

Consequences:

- A Capsule app can read and write files available to the current user.
- A Capsule app can read environment variables available to the current process.
- A Capsule app can access the network if the runtime allows it.
- A Capsule app can spawn processes if its code uses available runtime APIs.
- A Capsule app shares the process with the Capsule runner during execution.

Do not run Capsule apps from publishers you do not trust.

## What Signatures Prove

A verified Keyring signature proves:

- A specific content hash was signed by the private key associated with a Keyring certificate.
- The Keyring has a public record mapping that hash to an author identity.
- The downloaded archive's `manifest.json` and `bundle.js` match the registered hash.

The Registry also uses Keyring verification to enforce package ownership by `certificateId` during publish.

## What Signatures Do Not Prove

Signatures do not prove:

- That the code is safe.
- That the code is free of malware.
- That the author identity has been legally or personally verified beyond the submitted name and email.
- That extra files in the ZIP are signed. The current content hash covers `manifest.json` and `bundle.js` only.
- That execution is isolated from the user's system.

## Unsigned and Untrusted Apps

The CLI currently warns and continues for unsigned, untrusted, offline-verified, or corrupt signatures.

Warnings include:

```text
This capsule is not signed or could not be verified. Proceed with caution.
This capsule is not trusted by the Keyring registry. Proceed with caution.
Offline verification successful. Keyring server unreachable, cannot confirm author identity.
Signature is forged or corrupt. Proceed with caution.
```

Current behavior does not block install or execution after these warnings.

## Private Key Handling

The Keyring returns the private key only once during certificate issuance.

The CLI stores it locally in:

```text
~/.capsule/certificate.json
```

On Windows, the path is under the Capsule store root in `%APPDATA%` or `%USERPROFILE%\AppData\Roaming`.

The CLI writes the certificate file with mode `0600` and then attempts `chmod 0600`. File permission behavior depends on the platform and filesystem.

Anyone with access to this file can sign and publish as that certificate.

## Operational Risks

Current implementation limitations to account for:

- Keyring certificate issuance count uses KV and is not transactional.
- Registry package ownership uses KV and is not protected by an atomic compare-and-set.
- `capsule run` executes local archives without Keyring verification in the current implementation.
- `capsule get` verification warnings do not stop installation.
- The Registry publish endpoint reads accepted files into memory after enforcing the 10 MB limit.
