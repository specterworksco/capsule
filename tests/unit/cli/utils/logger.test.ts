import { describe, expect, test } from "bun:test";
import { formatError } from "../../../../apps/cli/src/utils/logger";

describe("formatError", () => {
  test("returns message for Error instances", () => {
    expect(formatError(new Error("something broke"))).toBe("something broke");
  });

  test("returns message for TypeError instances", () => {
    expect(formatError(new TypeError("bad type"))).toBe("bad type");
  });

  test("converts string to string", () => {
    expect(formatError("plain string error")).toBe("plain string error");
  });

  test("converts number to string", () => {
    expect(formatError(42)).toBe("42");
  });

  test("converts object to string", () => {
    expect(formatError({ code: 500 })).toBe("[object Object]");
  });

  test("converts null to string", () => {
    expect(formatError(null)).toBe("null");
  });

  test("converts undefined to string", () => {
    expect(formatError(undefined)).toBe("undefined");
  });
});
