import { defineCommand } from "citty";
import { buildCapsule } from "../core/builder";
import { logger } from "../utils/logger";

export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Build the current project into a .capsule.app archive",
  },
  args: {
    output: {
      type: "string",
      alias: "o",
      description: "Output file path",
    },
    protect: {
      type: "boolean",
      description: "Obfuscate bundle.js using javascript-obfuscator",
    },
  },
  async run({ args }) {
    logger.section("Build archive");

    const result = await logger.spinner("Bundling project", () =>
      buildCapsule({
        cwd: process.cwd(),
        output: args.output,
        protect: args.protect,
      }),
    );

    logger.success(`Built ${logger.path(result.outputPath)}`);
    if (!result.signed) {
      logger.warn("No certificate found - capsule will be unsigned. Run `capsule certificate request` to get one.");
      logger.hint(`Run ${logger.command("capsule certificate request")} to sign future builds.`);
    }
  },
});
