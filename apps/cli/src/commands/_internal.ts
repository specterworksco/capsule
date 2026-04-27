import { defineCommand } from "citty";
import { runBundle } from "../core/runner";

export const internalRunCommand = defineCommand({
  meta: {
    name: "__run",
    description: "Run an extracted bundle directly",
    hidden: true,
  },
  args: {
    bundle: {
      type: "positional",
      required: true,
      description: "Path to bundle.js",
    },
  },
  async run({ args }) {
    const [bundle, ...appArgs] = args._;

    if (!bundle) {
      throw new Error("Missing bundle path");
    }

    await runBundle(bundle, appArgs);
  },
});
