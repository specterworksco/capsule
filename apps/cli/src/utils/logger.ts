import pc from "picocolors";

export const logger = {
  info(message: string) {
    console.log(message);
  },
  success(message: string) {
    console.log(pc.green(message));
  },
  warn(message: string) {
    console.warn(pc.yellow(message));
  },
  error(message: string) {
    console.error(pc.red(message));
  },
};

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
