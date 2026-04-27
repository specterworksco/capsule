export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function parseVersion(version: string): [number, number, number] {
  const core = version.split(/[+-]/, 1)[0] ?? "0.0.0";
  const parts = core.split(".").map((part) => Number.parseInt(part, 10));

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
