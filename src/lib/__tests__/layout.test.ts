/**
 * Guarda do layout da lista — o bug que esvaziou o histórico na tela.
 *
 * Não é teste de "o CSS está bonito": é a trava de UM defeito medido. O `.list`
 * é `display:flex; flex-direction:column; overflow-y:auto`, então cada item é um
 * flex ITEM dele. Flex item encolhe por padrão até o "tamanho mínimo automático"
 * — que costuma ser o tamanho do conteúdo, e é o que segurava a altura. Mas
 * `overflow: hidden` no item (necessário pro border-radius cortar o hover do
 * corpo) muda esse mínimo pra ZERO. Com a lista cheia, o navegador então não
 * rola: ele ESMAGA. Medido no app rodando, antes do conserto: item de 2,9px em
 * vez de 56,2px, texto invisível, imagem reduzida à fatia de cima, e
 * `scrollHeight === clientHeight` (nada a rolar — tudo "coube" depois de
 * esmagado). Com poucos itens não aparece; o bug nasce quando o histórico
 * finalmente fica útil.
 *
 * A regra que este teste impõe: **item de lista com `overflow` não-visível
 * dentro de um container flex que rola PRECISA de `flex-shrink: 0`.** Ler o CSS
 * como texto é feio, mas é o único jeito de travar isso sem um navegador — e um
 * teste de unidade que não roda navegador nenhum jamais pegaria o esmagamento.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../App.css", import.meta.url)), "utf8");

/** O corpo de uma regra `seletor { ... }` (a primeira que casar exatamente). */
function ruleBody(selector: string): string {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
  const m = re.exec(css);
  expect(m, `regra ${selector} não encontrada em App.css`).not.toBeNull();
  return m![2];
}

describe("layout da lista", () => {
  it(".list rola em coluna (a premissa do teste seguinte)", () => {
    const body = ruleBody(".list");
    expect(body).toMatch(/flex-direction:\s*column/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it(".clip-item não encolhe — senão a lista cheia esmaga em vez de rolar", () => {
    const body = ruleBody(".clip-item");
    // A premissa que zera o mínimo automático. Se um dia o `overflow: hidden`
    // sair daqui, este teste avisa que a razão do `flex: none` mudou.
    expect(body).toMatch(/overflow:\s*hidden/);
    expect(body).toMatch(/flex:\s*none|flex-shrink:\s*0/);
  });
});
