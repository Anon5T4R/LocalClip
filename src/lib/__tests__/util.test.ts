import { describe, expect, it } from "vitest";
import { fmtBytes, formatWhen, textPreview } from "../util";

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

describe("fmtBytes", () => {
  it("usa base 1024 e casa decimal só a partir de MB", () => {
    expect(fmtBytes(0)).toBe("0 KB");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1024)).toBe("1 KB");
    expect(fmtBytes(1536)).toBe("2 KB"); // arredonda: "1,5 KB" é ruído
    expect(fmtBytes(1024 * 1024)).toBe("1.0 MB");
    expect(fmtBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
    expect(fmtBytes(1024 ** 3 * 2.25)).toBe("2.3 GB");
  });

  it("não quebra com entrada inválida", () => {
    // O backend devolve u64, mas um erro de ponte viraria NaN — e o painel de
    // dados não pode mostrar "NaN undefined" pro usuário.
    expect(fmtBytes(Number.NaN)).toBe("0 KB");
    expect(fmtBytes(-5)).toBe("0 KB");
  });
});
