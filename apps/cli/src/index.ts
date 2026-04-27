import { runCli } from "./cli";
import { getInstalledApp, getInvokedAppName } from "./core/store";
import { runBundle } from "./core/runner";
import { formatError, logger } from "./utils/logger";

async function main(): Promise<void> {
  const invokedAppName = getInvokedAppName();

  if (invokedAppName) {
    const app = await getInstalledApp(invokedAppName);
    if (app) {
      await runBundle(app.bundlePath, process.argv.slice(2));
      return;
    }
  }

  await runCli();
}

main().catch((error) => {
  logger.error(formatError(error));
  process.exitCode = 1;
});
