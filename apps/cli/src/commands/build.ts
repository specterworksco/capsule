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
  },
  async run({ args }) {
    const result = await buildCapsule({
      cwd: process.cwd(),
      output: args.output,
    });

    logger.success(`Built ${result.outputPath}`);
    if (!result.signed) {
      logger.warn("No certificate found - capsule will be unsigned. Run `capsule certificates request` to get one.");
    }
  },
});
