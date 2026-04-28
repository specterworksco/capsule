import pc from "picocolors";
import { clearLine, cursorTo } from "node:readline";

const spinnerFrames = ["◐", "◓", "◑", "◒"];
const isInteractive = Boolean(process.stdout.isTTY && !process.env.CI);

function styleMessage(icon: string, message: string, color: (value: string) => string): string {
  return `${color(icon)} ${message}`;
}

function clearCurrentLine(): void {
  if (!isInteractive) {
    return;
  }

  clearLine(process.stdout, 0);
  cursorTo(process.stdout, 0);
}

export const logger = {
  brand() {
    console.log(
      [
        pc.cyan("   ______                       __   "),
        pc.cyan("  / ____/___ _____  _______  __/ /__ "),
        pc.cyan(" / /   / __ `/ __ \\/ ___/ / / / / _ \\"),
        pc.cyan("/ /___/ /_/ / /_/ (__  ) /_/ / /  __/"),
        pc.cyan("\\____/\\__,_/ .___/____/\\__,_/_/\\___/ "),
        pc.cyan("          /_/"),
        "",
        `${pc.bold("Capsule")} ${pc.dim(":: Ship JS/TS apps without shipping a JS runtime.")}`,
        "",
      ].join("\n"),
    );
  },
  section(message: string) {
    console.log(`${pc.bold(pc.cyan("Capsule"))} ${pc.dim("/ ")}${pc.bold(message)}`);
  },
  info(message: string) {
    console.log(styleMessage("•", message, pc.cyan));
  },
  success(message: string) {
    console.log(styleMessage("✓", message, pc.green));
  },
  warn(message: string) {
    console.warn(styleMessage("!", message, pc.yellow));
  },
  error(message: string) {
    console.error(styleMessage("✕", message, pc.red));
  },
  hint(message: string) {
    console.log(styleMessage("→", pc.dim(message), pc.magenta));
  },
  label(label: string, value: string) {
    console.log(`${pc.dim(label.padEnd(10))} ${value}`);
  },
  path(path: string) {
    return pc.cyan(path);
  },
  command(command: string) {
    return pc.cyan(command);
  },
  async spinner<T>(message: string, action: () => Promise<T>): Promise<T> {
    if (!isInteractive) {
      console.log(styleMessage("•", `${message}...`, pc.cyan));
      return action();
    }

    let frameIndex = 0;
    process.stdout.write(`${pc.cyan(spinnerFrames[frameIndex])} ${message}`);

    const timer = setInterval(() => {
      frameIndex = (frameIndex + 1) % spinnerFrames.length;
      clearCurrentLine();
      process.stdout.write(`${pc.cyan(spinnerFrames[frameIndex])} ${message}`);
    }, 80);

    try {
      return await action();
    } finally {
      clearInterval(timer);
      clearCurrentLine();
    }
  },
};

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
