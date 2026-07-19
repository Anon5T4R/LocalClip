import { describe, expect, it } from "vitest";
import {
  joinLines,
  squish,
  toLower,
  toTitle,
  toUpper,
  TRANSFORMS,
  trimEnds,
} from "../transform";

describe("caixa com acentuação (o caso que motivou a feature)", () => {
  it("sobe acento em português", () => {
    expect(toUpper("ação")).toBe("AÇÃO");
    expect(toUpper("José não foi")).toBe("JOSÉ NÃO FOI");
    expect(toUpper("coração, órfão e ínterim")).toBe("CORAÇÃO, ÓRFÃO E ÍNTERIM");
  });

  it("desce acento em português", () => {
    expect(toLower("AÇÃO")).toBe("ação");
    expect(toLower("JOSÉ NÃO")).toBe("josé não");
  });

  it("ida e volta preserva o texto acentuado", () => {
    expect(toLower(toUpper("não é você, é a ação"))).toBe("não é você, é a ação");
  });

  // Casos do padrão Unicode que NÃO são 1:1 — documentados no módulo.
  it("ß vira SS na subida (expansão de 1 pra 2 caracteres)", () => {
    expect(toUpper("straße")).toBe("STRASSE");
  });

  it("İ desce pra i + ponto combinante (U+0307)", () => {
    expect(toLower("İ")).toBe("i̇");
  });

  // Prova de que NÃO usamos casing por locale: numa máquina turca o
  // toLocaleUpperCase("tr") daria "İD" — aqui tem que dar "ID".
  it("não aplica a regra turca do i sem pingo", () => {
    expect(toUpper("id")).toBe("ID");
    expect(toLower("ID")).toBe("id");
  });

  it("não mexe em quem não tem caixa", () => {
    expect(toUpper("123 — 日本語 🙂")).toBe("123 — 日本語 🙂");
  });
});

describe("toTitle", () => {
  it("capitaliza cada palavra com acento", () => {
    expect(toTitle("ação do josé")).toBe("Ação Do José");
    expect(toTitle("órgão")).toBe("Órgão");
  });

  it("normaliza texto que veio todo maiúsculo", () => {
    expect(toTitle("RELATÓRIO FINAL")).toBe("Relatório Final");
  });

  it("trata hífen e apóstrofo como separador (comportamento assumido)", () => {
    expect(toTitle("bem-vindo à copa d'água")).toBe("Bem-Vindo À Copa D'Água");
  });

  it("preserva pontuação, espaços internos e quebras", () => {
    expect(toTitle("olá,  mundo!\nadeus")).toBe("Olá,  Mundo!\nAdeus");
  });

  it("não corta par substituto ao fatiar a palavra", () => {
    // 🙂 não é letra, então forma sua própria "não-palavra": nada quebrado.
    expect(toTitle("café 🙂 quente")).toBe("Café 🙂 Quente");
  });

  it("string vazia continua vazia", () => {
    expect(toTitle("")).toBe("");
  });
});

describe("trimEnds", () => {
  it("corta espaços, tabs e quebras das pontas e preserva o miolo", () => {
    expect(trimEnds("  \n\tolá  mundo \n ")).toBe("olá  mundo");
  });

  it("corta NBSP e BOM (o lixo típico de página web)", () => {
    expect(trimEnds(" ﻿ação ")).toBe("ação");
  });
});

describe("joinLines", () => {
  it("junta quebras absorvendo os espaços grudados", () => {
    expect(joinLines("linha um\n  linha dois\nlinha três")).toBe("linha um linha dois linha três");
  });

  it("colapsa linha em branco (várias quebras) num espaço só", () => {
    expect(joinLines("a\n\n\nb")).toBe("a b");
  });

  it("cobre CRLF e CR", () => {
    expect(joinLines("a\r\nb\rc")).toBe("a b c");
  });

  it("preserva espaçamento DENTRO da linha (é o que separa do squish)", () => {
    expect(joinLines("a    b\nc")).toBe("a    b c");
  });

  it("apara quebras nas pontas sem deixar espaço órfão", () => {
    expect(joinLines("\nação\n")).toBe("ação");
  });
});

describe("squish", () => {
  it("colapsa qualquer whitespace e apara", () => {
    expect(squish("  a \t\t b \n\n c  ")).toBe("a b c");
  });

  it("colapsa NBSP junto (\\s inclui U+00A0)", () => {
    expect(squish("a  b")).toBe("a b");
  });

  it("texto já limpo passa intacto (idempotente)", () => {
    expect(squish(squish("olá mundo"))).toBe("olá mundo");
  });
});

describe("registro TRANSFORMS", () => {
  it("tem ids únicos e todas as funções são puras quanto ao argumento", () => {
    const ids = TRANSFORMS.map((tr) => tr.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["upper", "lower", "title", "trim", "joinLines", "squish"]);
  });

  it("nenhuma transformação quebra com string vazia", () => {
    for (const tr of TRANSFORMS) expect(tr.apply("")).toBe("");
  });

  it("nenhuma transformação perde acento de 'ação'", () => {
    for (const tr of TRANSFORMS) expect(tr.apply("ação").toLowerCase()).toBe("ação");
  });
});
