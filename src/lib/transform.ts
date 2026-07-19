/**
 * Transformações rápidas de texto aplicadas NA HORA DE COPIAR.
 *
 * Regra de ouro deste módulo: nada aqui toca o histórico. O item no SQLite é o
 * que o usuário copiou um dia — é dado dele, não rascunho nosso. Estas funções
 * são puras (string -> string) e o resultado vai SÓ pro clipboard; quem chama
 * usa o comando `copy_text` do Rust, que não faz UPDATE nenhum no banco (o
 * `copy_item`, por contraste, sobe o item pro topo — por isso não dá pra
 * reaproveitar ele aqui).
 *
 * ACENTUAÇÃO / porquê `toUpperCase` e NÃO `toLocaleUpperCase`:
 * o algoritmo padrão do Unicode (o que `toUpperCase` implementa) já resolve
 * português inteiro — "ação" -> "AÇÃO", "josé" -> "JOSÉ" — porque ç/ã/é têm
 * mapeamento de caixa 1:1 e incondicional. `toLocaleUpperCase` só muda o
 * resultado em três locales com regra especial: tr/az (i -> İ com pingo, I -> ı
 * sem pingo) e lt (pingos combinantes). Passar um locale aqui seria um RISCO
 * sem ganho: a UI tem pt/en/es, nenhum deles altera nada, mas se algum dia o
 * locale vier do sistema (navigator.language) uma máquina turca começaria a
 * transformar "id" em "İD" silenciosamente. Caixa invariável é o comportamento
 * previsível pra um utilitário de clipboard. Consequências conhecidas e
 * aceitas do padrão Unicode: "ß" -> "SS" (cresce 1 caractere) e "İ" -> "i̇"
 * (vira i + U+0307 combinante) — ambos cobertos por teste.
 */

/** Tudo em caixa alta. Ver nota de acentuação no topo. */
export function toUpper(text: string): string {
  return text.toUpperCase();
}

/** Tudo em caixa baixa. Ver nota de acentuação no topo. */
export function toLower(text: string): string {
  return text.toLowerCase();
}

/**
 * Regex de "palavra" pro Title Case: sequência de letras (\p{L}), marcas
 * combinantes (\p{M} — senão "a" + acento solto quebraria a palavra em duas) e
 * dígitos. Flag `u` é obrigatória pra \p{...} valer.
 *
 * O apóstrofo e o hífen NÃO entram de propósito: "d'água" vira "D'Água" e
 * "bem-vindo" vira "Bem-Vindo". É a convenção de Title Case mais comum e, mais
 * importante, é PREVISÍVEL — a alternativa (lista de exceções, artigos que
 * ficam minúsculos tipo "de"/"da"/"of") é dependente de idioma e vira
 * adivinhação; num transformador de 1 clique, surpresa é pior que rigidez.
 */
const PALAVRA = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Capitaliza a inicial de cada palavra e minúscula o resto — normaliza também
 * texto que veio TODO MAIÚSCULO (caso real: copiar título de site).
 * Usa Array.from pra fatiar por code point: com `[0]` um caractere fora do BMP
 * (emoji, por ex.) seria cortado no meio do par substituto e viraria lixo.
 */
export function toTitle(text: string): string {
  return text.replace(PALAVRA, (w) => {
    const cps = Array.from(w);
    return cps[0].toUpperCase() + cps.slice(1).join("").toLowerCase();
  });
}

/**
 * Só as pontas. `trim()` do JS corta whitespace Unicode (inclui NBSP U+00A0 e
 * o BOM/ZWNBSP U+FEFF) — exatamente o que gruda em texto copiado de página web.
 */
export function trimEnds(text: string): string {
  return text.trim();
}

/**
 * Junta linhas: cada quebra (com os espaços grudados nela) vira UM espaço.
 * Caso que motivou: texto copiado de PDF/coluna estreita chega picado em 8
 * linhas e não cabe num campo de linha única.
 * Preserva o espaçamento DENTRO da linha de propósito — quem quer normalizar
 * tudo usa o `squish`. Cobre CRLF, CR e LF; o `trim` no fim evita espaço órfão
 * quando o texto começa/termina com quebra.
 */
export function joinLines(text: string): string {
  return text.replace(/[ \t]*(?:\r\n|[\r\n])+[ \t]*/g, " ").trim();
}

/**
 * Versão forte: QUALQUER sequência de whitespace (espaços, tabs, quebras,
 * NBSP) vira um espaço só, e apara as pontas. É o mesmo tratamento que o
 * `textPreview` já faz na lista — aqui vira ação explícita, pra colar limpo o
 * que veio de uma tabela ou de HTML mal formatado.
 */
export function squish(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Ids estáveis das transformações — a UI e o i18n se amarram por eles. */
export type TransformId = "upper" | "lower" | "title" | "trim" | "joinLines" | "squish";

/**
 * Registro único: a UI itera esta lista, então adicionar transformação = uma
 * entrada aqui + as 3 chaves de i18n (pt/en/es; esquecer uma QUEBRA o tsc).
 * `label` é o rótulo curto do botão (a lista de itens é estreita — não cabe
 * texto); o nome por extenso vai no `title`, traduzido pelo caller.
 */
export const TRANSFORMS: ReadonlyArray<{
  id: TransformId;
  label: string;
  apply: (text: string) => string;
}> = [
  { id: "upper", label: "AA", apply: toUpper },
  { id: "lower", label: "aa", apply: toLower },
  { id: "title", label: "Aa", apply: toTitle },
  { id: "trim", label: "⇤⇥", apply: trimEnds },
  { id: "joinLines", label: "¶→", apply: joinLines },
  { id: "squish", label: "␣", apply: squish },
];
