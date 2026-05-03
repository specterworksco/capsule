import { defineCommand } from "citty";
import { start } from "node:repl";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getAppDir, getInstalledApp } from "../core/store";
import { activateSandbox, installSandboxProxies } from "../core/sandbox";
import { logger } from "../utils/logger";

export const replCommand = defineCommand({
  meta: {
    name: "repl",
    description: "Open a REPL (interactive playground) with a capsule app's exports loaded",
  },
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Name of the installed app to load into the REPL",
    },
  },
  async run({ args }) {
    const name = args._[0] as string;
    if (!name) {
      throw new Error("Missing app name. Usage: capsule repl <app-name>");
    }

    const app = await getInstalledApp(name);
    if (!app) {
      throw new Error(`App "${name}" is not installed. Install it first with 'capsule registry install ${name}'`);
    }

    logger.section(`REPL: ${name}@${app.manifest.version}`);
    logger.info(`Loading ${name}'s exports into the REPL context...`);

    // Activate sandbox for the app
    const deactivatePermissions = activateSandbox(name);
    const deactivateProxies = installSandboxProxies();

    try {
      const url = pathToFileURL(app.bundlePath);
      url.searchParams.set("capsuleRun", Date.now().toString());
      const mod = await import(url.href);

      // Start the REPL
      const replServer = start({
        prompt: `capsule:${name}> `,
        useColors: true,
        preview: true,
      });

      // Define a help function
      replServer.defineCommand("exports", {
        help: "List all exported functions/variables from the loaded capsule",
        action() {
          const exportNames = Object.keys(mod).filter((k) => k !== "default");
          console.log("\nLoaded exports from", name);
          console.log("———————————————");
          if (exportNames.length === 0 && !("default" in mod)) {
            console.log("(no exports found)");
          }
          if (exportNames.length > 0) {
            for (const key of exportNames) {
              const val = (mod as Record<string, unknown>)[key];
              console.log(`  ${key} :: ${typeof val}`);
            }
          }
          if ("default" in mod) {
            console.log(`  default :: ${typeof mod.default}`);
          }
          console.log("");
          replServer.displayPrompt();
        },
      });

      // Put the module exports into the REPL context
      for (const [key, value] of Object.entries(mod)) {
        (replServer.context as Record<string, unknown>)[key] = value;
      }

      // Also add some helper info
      (replServer.context as Record<string, unknown>).__capsule_info = {
        name,
        version: app.manifest.version,
        description: app.manifest.description,
        author: app.manifest.author,
      };

      console.log("");
      logger.info(`Module exports loaded into the REPL context. Type .exports to list them.`);
      console.log(`Type .help for available REPL commands.`);
      console.log("");

      // Return the repl server so it stays open
      return new Promise<void>(() => {
        replServer.on("exit", () => {
          deactivatePermissions();
          deactivateProxies();
        });
      });
    } catch (error) {
      deactivatePermissions();
      deactivateProxies();
      throw new Error(`Failed to load app: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
