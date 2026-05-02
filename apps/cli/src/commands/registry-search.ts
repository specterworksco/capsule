import { defineCommand } from "citty";
import pc from "picocolors";
import { resolveRegistryServer } from "../core/registry-client";
import { searchPackages } from "../core/registry-client";
import { logger } from "../utils/logger";

export const registrySearchCommand = defineCommand({
  meta: {
    name: "search",
    description: "Search for packages in the Capsule registry",
  },
  args: {
    query: {
      type: "positional",
      required: true,
      description: "Search query",
    },
    "registry-server": {
      type: "string",
      description: "Registry server URL",
    },
  },
  async run({ args }) {
    const query = args._[0];
    if (!query) {
      throw new Error("Missing search query");
    }

    logger.section("Search registry");

    const registryServer = resolveRegistryServer(args["registry-server"] as string | undefined);
    const response = await searchPackages(registryServer, query);

    if (response.results.length === 0) {
      logger.info(`No results found for "${query}".`);
      return;
    }

    logger.info(`Found ${response.results.length} result(s) for "${query}":`);
    console.log("");

    const namePad = Math.max(...response.results.map((r) => r.name.length), 4);
    const verPad = Math.max(...response.results.map((r) => r.latestVersion.length), 7);

    console.log(
      `${pc.bold("Name".padEnd(namePad))}  ${pc.bold("Version".padEnd(verPad))}  ${pc.bold("Description")}`,
    );
    console.log(pc.dim("─".repeat(Math.max(namePad + verPad + 60, 60))));

    for (const result of response.results) {
      console.log(
        `${result.name.padEnd(namePad)}  ${result.latestVersion.padEnd(verPad)}  ${result.description ?? pc.dim("—")}`,
      );
    }
  },
});
