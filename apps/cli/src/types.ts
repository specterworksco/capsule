import type { Manifest } from "@capsule/shared";

export type BuildOptions = {
  cwd: string;
  output?: string;
};

export type BuildResult = {
  outputPath: string;
  signed: boolean;
};

export type RunOptions = {
  appArgs: string[];
};

export type InstalledApp = {
  manifest: Manifest;
  appDir: string;
  bundlePath: string;
};
