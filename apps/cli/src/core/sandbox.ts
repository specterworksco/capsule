import type { Permission } from "@capsule/shared";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAppDir } from "./store";

/**
 * Loaded permissions for the currently running capsule app.
 * Set before a bundle is imported.
 */
let activePermissions: Permission | null = null;
let activeAppName: string | null = null;

export function getActiveAppName(): string | null {
  return activeAppName;
}

export function getActivePermissions(): Permission | null {
  return activePermissions;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Load permissions for a given app from the store.
 */
export function loadAppPermissions(appName: string): Permission | null {
  const permissionsPath = join(getAppDir(appName), "permissions.json");
  if (!existsSync(permissionsPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(permissionsPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Activate sandbox for a given app by loading its permissions.
 * Returns a function to deactivate the sandbox.
 */
export function activateSandbox(appName: string): () => void {
  const permissions = loadAppPermissions(appName);
  activePermissions = permissions;
  activeAppName = appName;

  return () => {
    activePermissions = null;
    activeAppName = null;
  };
}

/**
 * Activate sandbox with explicit permissions (used for ephemeral execution).
 */
export function activateSandboxWithPermissions(permissions: Permission, name: string): () => void {
  activePermissions = permissions;
  activeAppName = name;

  return () => {
    activePermissions = null;
    activeAppName = null;
  };
}

/**
 * Check if a filesystem operation is allowed.
 */
export function checkFSPermission(mode: "read" | "write"): PermissionCheckResult {
  if (!activePermissions) {
    return { allowed: false, reason: "No permissions declared. App cannot access the filesystem." };
  }

  const fsPerms = activePermissions.fs;
  if (!fsPerms || fsPerms.length === 0) {
    return { allowed: false, reason: "Filesystem access not granted." };
  }

  if (mode === "read") {
    const allowed = fsPerms.includes("read") || fsPerms.includes("readwrite");
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: "Read access not granted. Declare 'read' or 'readwrite' in permissions.fs." };
  }

  if (mode === "write") {
    const allowed = fsPerms.includes("write") || fsPerms.includes("readwrite");
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: "Write access not granted. Declare 'write' or 'readwrite' in permissions.fs." };
  }

  return { allowed: false };
}

/**
 * Check if a network operation to a given host is allowed.
 */
export function checkNetPermission(host?: string): PermissionCheckResult {
  if (!activePermissions) {
    return { allowed: false, reason: "No permissions declared. App cannot access the network." };
  }

  const netPerms = activePermissions.net;
  if (!netPerms) {
    return { allowed: false, reason: "Network access not granted." };
  }

  if (typeof netPerms === "boolean") {
    return netPerms
      ? { allowed: true }
      : { allowed: false, reason: "Network access explicitly denied." };
  }

  if (host && netPerms.some((allowed) => host.includes(allowed))) {
    return { allowed: true };
  }

  if (!host && netPerms.length > 0) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Network access to '${host}' not granted.` };
}

/**
 * Check if a specific environment variable is allowed.
 */
export function checkEnvPermission(name: string): PermissionCheckResult {
  if (!activePermissions) {
    return { allowed: false, reason: "No permissions declared. App cannot access environment variables." };
  }

  const envPerms = activePermissions.env;
  if (!envPerms) {
    return { allowed: false, reason: "Environment variable access not granted." };
  }

  if (typeof envPerms === "boolean") {
    return envPerms
      ? { allowed: true }
      : { allowed: false, reason: "Environment variable access explicitly denied." };
  }

  if (envPerms.includes(name)) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Environment variable '${name}' not in allowed list.` };
}

/**
 * Check if subprocess spawning is allowed.
 */
export function checkSubprocessPermission(): PermissionCheckResult {
  if (!activePermissions) {
    return { allowed: false, reason: "No permissions declared. App cannot spawn subprocesses." };
  }

  if (activePermissions.subprocess) {
    return { allowed: true };
  }

  return { allowed: false, reason: "Subprocess spawning not granted." };
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(`[Capsule Sandbox] ${message}`);
    this.name = "SecurityError";
  }
}

/**
 * Install sandbox proxies on the global environment BEFORE importing a bundle.
 * This intercepts:
 *  - process.env (read/getOwnPropertyDescriptor)
 *  - node:child_process (exec, spawn, execSync, etc.)
 *
 * Note: Full interception of node:fs and node:net requires dynamic module
 * patching which is applied via the import() hook in runner.ts
 */
export function installSandboxProxies(): () => void {
  const restoreFns: (() => void)[] = [];

  // --- Intercept process.env ---
  const originalEnv = process.env;

  const envProxy = new Proxy(originalEnv, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const check = checkEnvPermission(prop);
        if (!check.allowed) {
          throw new SecurityError(check.reason ?? `Cannot access env variable '${prop}'`);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string") {
        const check = checkEnvPermission(prop);
        if (!check.allowed) {
          return undefined;
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    has(target, prop) {
      if (typeof prop === "string") {
        const check = checkEnvPermission(prop);
        if (!check.allowed) {
          return false;
        }
      }
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      if (!activePermissions) return [];
      const envPerms = activePermissions.env;
      if (typeof envPerms === "boolean" && envPerms) {
        return Reflect.ownKeys(target);
      }
      if (Array.isArray(envPerms)) {
        return envPerms.filter((key) => key in target);
      }
      return [];
    },
  });

  // Replace process.env with the proxy
  Object.defineProperty(process, "env", {
    value: envProxy,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  restoreFns.push(() => {
    Object.defineProperty(process, "env", {
      value: originalEnv,
      writable: true,
      enumerable: true,
      configurable: false,
    });
  });

  return () => {
    for (const restore of restoreFns) {
      restore();
    }
  };
}

// Re-export Permission type used by runner
export type { Permission } from "@capsule/shared";

/**
 * Create a set of module overrides for node:child_process.
 * These are injected into the import scope. This provides basic
 * permission checking by wrapping the original module calls.
 */
export function createChildProcessOverride(): Record<string, unknown> {
  // Dynamically import child_process to avoid issues with Bun/ESM
  // Actual permission checking happens at the call site
  const check = () => {
    const result = checkSubprocessPermission();
    if (!result.allowed) {
      throw new SecurityError(result.reason ?? "Cannot spawn child processes");
    }
  };

  // Return wrappers that check permissions then delegate
  const wrapped: Record<string, (...args: unknown[]) => unknown> = {};

  const wrapMethod = (methodName: string) => {
    return (...args: unknown[]) => {
      check();
      // Dynamic import for the real module
      return import("node:child_process").then((mod) => {
        const fn = (mod as Record<string, unknown>)[methodName] as (...args: unknown[]) => unknown;
        return fn(...args);
      });
    };
  };

  wrapped.exec = wrapMethod("exec");
  wrapped.execSync = wrapMethod("execSync");
  wrapped.spawn = wrapMethod("spawn");
  wrapped.spawnSync = wrapMethod("spawnSync");
  wrapped.fork = wrapMethod("fork");
  wrapped.execFile = wrapMethod("execFile");
  wrapped.execFileSync = wrapMethod("execFileSync");

  return wrapped;
}
