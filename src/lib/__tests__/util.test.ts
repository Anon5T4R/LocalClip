import { describe, expect, it } from "vitest";
import { formatWhen, textPreview } from "../util";

const labels = { now: "agora", min: "{n} min", hour: "{n} h" };

describe("formatWhen", () => {
  it("relativo recente", () => {
    expect(formatWhen(Date.now() - 20_000, "pt-BR", labels)).toBe("agora");
    expect(formatWhen(Date.now() - 7 * 60_000, "pt-BR", labels)).toBe("7 min");
    expect(formatWhen(Date.now() - 2 * 3_600_000, "pt-BR", labels)).toBe("2 h");
  });
});

describe("textPreview", () => {
  it("comprime espaços e corta", () => {
    expect(textPreview("a\n  b\t c")).toBe("a b c");
    expect(textPreview("x".repeat(300), 10)).toBe("xxxxxxxxxx…");
  });
});
