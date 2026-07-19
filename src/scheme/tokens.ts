import type { TokenDefinition, TokenId } from "../core/model.js";

export const INITIALS = [
  "ㄅ", "ㄆ", "ㄇ", "ㄈ", "ㄉ", "ㄊ", "ㄋ", "ㄌ", "ㄍ", "ㄎ", "ㄏ",
  "ㄐ", "ㄑ", "ㄒ", "ㄓ", "ㄔ", "ㄕ", "ㄖ", "ㄗ", "ㄘ", "ㄙ",
] as const;

export const MEDIALS = ["ㄧ", "ㄨ", "ㄩ"] as const;

export const FINALS = [
  "ㄚ", "ㄛ", "ㄜ", "ㄝ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄦ",
] as const;

export const TONES = [1, 2, 3, 4, 5] as const;

export type Tone = (typeof TONES)[number];
export type Initial = (typeof INITIALS)[number];

export function zhuyinToken(symbol: string): TokenId {
  return `zhuyin:${symbol}`;
}

export function toneToken(tone: Tone): TokenId {
  return `tone:${tone}`;
}

function definitions(symbols: readonly string[]): TokenDefinition[] {
  return symbols.map((symbol) => ({
    id: zhuyinToken(symbol),
    label: symbol,
    kind: "bopomofo" as const,
  }));
}

export const ZHUYIN_TOKENS: readonly TokenDefinition[] = [
  ...definitions(INITIALS),
  ...definitions(MEDIALS),
  ...definitions(FINALS),
  ...TONES.map((tone) => ({
    id: toneToken(tone),
    label: tone === 1 ? "一聲" : tone === 2 ? "二聲" : tone === 3 ? "三聲" : tone === 4 ? "四聲" : "輕聲",
    kind: "tone" as const,
  })),
];

export const BOPOMOFO_SYMBOLS = new Set(
  [...INITIALS, ...MEDIALS, ...FINALS] as readonly string[],
);
