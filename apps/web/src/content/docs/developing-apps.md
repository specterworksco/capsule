# Developing Capsule Apps

## Table of Contents

- [Overview](#overview)
- [Project Configuration](#project-configuration)
- [Entrypoint Resolution](#entrypoint-resolution)
- [Bundling](#bundling)
- [Runtime Model](#runtime-model)
- [Arguments](#arguments)
- [Assets and Extra Files](#assets-and-extra-files)
- [Publishing Requirements](#publishing-requirements)

## Overview

Capsule apps are JavaScript or TypeScript apps bundled into a single `bundle.js` file and stored inside a `.capsule.app` ZIP archive.

The current implementation is best suited for command-line apps.

## Project Configuration

Capsule loads configuration in this order:

1. `capsule.config.ts` from the current working directory.
2. `package.json` from the current working directory.

### `capsule.config.ts`

The config schema is defined in `packages/shared/src/index.ts`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | App name. |
| `version` | string | Yes | App version. |
| `entry` | string | Yes | Source entrypoint path. |
| `author` | string | No | Author metadata copied into `manifest.json`. |
| `description` | string | No | Description copied into `manifest.json`. |
| `assets` | string array | No | Accepted by the config schema, but not used by the current builder implementation. |

Example:

```ts
export default {
  name: "myapp",
  version: "1.0.0",
  entry: "src/index.ts",
  author: "Jane Dev <jane@example.com>",
  description: "Example command-line app",
};
```

### `package.json` fallback

If `capsule.config.ts` does not exist, Capsule reads `package.json`.

| Package field | Used for |
| --- | --- |
| `name` | Capsule config `name`. |
| `version` | Capsule config `version`. |
| `description` | Capsule config `description`. |
| `author` | Capsule config `author`. |
| `bin` | Entrypoint resolution. |
| `main` | Entrypoint fallback. |

Author handling:

- If `author` is a string, it is used directly.
- If `author` is an object with `name` and `email`, it becomes `Name <email>`.
- If only `name` or `email` exists, that value is used.

## Entrypoint Resolution

When using `package.json`, the entrypoint is resolved as:

1. `bin` if it is a string.
2. `bin[pkg.name]` if `bin` is an object and has a matching key.
3. The first value in the `bin` object.
4. `main`.

If neither `capsule.config.ts` nor `package.json` exists, Capsule throws:

```text
Missing capsule.config.ts and package.json
```

## Bundling

Capsule bundles the entrypoint with `Bun.build`:

```ts
{
  target: "bun",
  format: "esm",
  minify: false
}
```

The output bundle is stored as `bundle.js` inside the archive.

If `Bun.build` fails, Capsule throws the collected build log messages, or:

```text
Bun.build failed
```

If no bundle output is produced, Capsule throws:

```text
Bun.build did not produce a bundle
```

## Runtime Model

Capsule runs apps by importing the bundled ESM file:

```ts
await import(bundleUrl)
```

This means:

- The app runs in the same process as the Capsule CLI invocation.
- Top-level code in the bundle is the app entrypoint.
- There is no worker process or subprocess isolation in the current runner.
- The runtime is Bun because the Capsule CLI is built and executed with Bun.

For security implications, see [Security](./security.md).

## Arguments

Before importing the bundle, Capsule temporarily sets:

```text
process.argv = [capsuleExecutable, bundlePath, ...appArgs]
```

After the import completes or throws, Capsule restores the previous `process.argv`.

## Assets and Extra Files

The config schema accepts `assets`, but the current builder does not copy assets into the archive.

The current archive produced by `capsule build` contains only:

- `manifest.json`
- `bundle.js`
- `capsule.sig`, if signed

If your app needs runtime files, they must be handled by code that survives the current bundling process. There is no implemented asset-copy pipeline yet.

## Publishing Requirements

To publish to the Registry, an app must satisfy both the archive format and Registry rules.

Important Registry rules:

- Package name must match `^[a-z0-9][a-z0-9-]{0,63}$`.
- Version must match `^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$`.
- `author` must be present and non-empty in `manifest.json`.
- The uploaded file must be 10 MB or smaller.
- The content hash must already be registered in the Keyring by the same `certificateId`.

See [Registry Server](./registry.md) for the full publish flow.
