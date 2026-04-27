import { defineCommand } from "citty";
import { runCapsuleFile } from "../core/runner";

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Run a local .capsule.app archive",
  },
  args: {
    file: {
      type: "positional",
      required: true,
      description: "Path to the .capsule.app file",
    },
  },
  async run({ args }) {
    const [file, ...appArgs] = args._;

    if (!file) {
      throw new Error("Missing .capsule.app file");
    }

    await runCapsuleFile(file, { appArgs });
  },
});
