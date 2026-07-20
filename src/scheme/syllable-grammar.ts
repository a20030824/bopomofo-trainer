import { INITIALS, type Initial } from "./tokens.js";

const set = (...values: string[]): ReadonlySet<string> => new Set(values);

// V1 compiles pure-Han catalog entries with one standalone syllable per character.
// The table therefore contains supported standalone catalog syllables, not every
// theoretically possible sound, no-character cell, or attached erhua form.
const SUPPORTED_ZERO_INITIAL_RIMES = set(
  "ㄚ", "ㄛ", "ㄜ", "ㄝ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄦ",
  "ㄧ", "ㄧㄚ", "ㄧㄛ", "ㄧㄝ", "ㄧㄞ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ",
  "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ",
  "ㄩ", "ㄩㄝ", "ㄩㄢ", "ㄩㄣ", "ㄩㄥ",
);

const SUPPORTED_RIMES_BY_INITIAL: Readonly<Record<Initial, ReadonlySet<string>>> = {
  ㄅ: set("ㄚ", "ㄛ", "ㄞ", "ㄟ", "ㄠ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄢ", "ㄧㄣ", "ㄧㄥ", "ㄨ"),
  ㄆ: set("ㄚ", "ㄛ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄢ", "ㄧㄣ", "ㄧㄥ", "ㄨ"),
  ㄇ: set("ㄚ", "ㄛ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄥ", "ㄨ"),
  ㄈ: set("ㄚ", "ㄛ", "ㄟ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ"),
  ㄉ: set("ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
  ㄊ: set("ㄚ", "ㄜ", "ㄞ", "ㄠ", "ㄡ", "ㄢ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄢ", "ㄧㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
  ㄋ: set("ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ", "ㄨ", "ㄨㄛ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ", "ㄩ", "ㄩㄝ"),
  ㄌ: set("ㄚ", "ㄛ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄤ", "ㄥ", "ㄧ", "ㄧㄚ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ", "ㄨ", "ㄨㄛ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ", "ㄩ", "ㄩㄝ", "ㄩㄢ"),
  ㄍ: set("ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ"),
  ㄎ: set("ㄚ", "ㄜ", "ㄞ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ"),
  ㄏ: set("ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ"),
  ㄐ: set("ㄧ", "ㄧㄚ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ", "ㄩ", "ㄩㄝ", "ㄩㄢ", "ㄩㄣ", "ㄩㄥ"),
  ㄑ: set("ㄧ", "ㄧㄚ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ", "ㄩ", "ㄩㄝ", "ㄩㄢ", "ㄩㄣ", "ㄩㄥ"),
  ㄒ: set("ㄧ", "ㄧㄚ", "ㄧㄝ", "ㄧㄠ", "ㄧㄡ", "ㄧㄢ", "ㄧㄣ", "ㄧㄤ", "ㄧㄥ", "ㄩ", "ㄩㄝ", "ㄩㄢ", "ㄩㄣ", "ㄩㄥ"),
  ㄓ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ"),
  ㄔ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ", "ㄨㄥ"),
  ㄕ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄚ", "ㄨㄛ", "ㄨㄞ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄤ"),
  ㄖ: set("", "ㄜ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
  ㄗ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
  ㄘ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
  ㄙ: set("", "ㄚ", "ㄜ", "ㄞ", "ㄟ", "ㄠ", "ㄡ", "ㄢ", "ㄣ", "ㄤ", "ㄥ", "ㄨ", "ㄨㄛ", "ㄨㄟ", "ㄨㄢ", "ㄨㄣ", "ㄨㄥ"),
};

const INITIAL_SET = new Set<string>(INITIALS);

export interface SyllableBodyAnalysis {
  readonly initial: Initial | null;
  readonly rime: string;
}

export function analyseSyllableBody(body: string): SyllableBodyAnalysis {
  const symbols = [...body];
  const first = symbols[0];
  if (first !== undefined && INITIAL_SET.has(first)) {
    return {
      initial: first as Initial,
      rime: symbols.slice(1).join(""),
    };
  }
  return { initial: null, rime: body };
}

export function isSupportedCatalogSyllableBody(body: string): boolean {
  if (body.length === 0) return false;
  const { initial, rime } = analyseSyllableBody(body);
  return initial === null
    ? SUPPORTED_ZERO_INITIAL_RIMES.has(rime)
    : SUPPORTED_RIMES_BY_INITIAL[initial].has(rime);
}

export function listSupportedCatalogSyllableBodies(): readonly string[] {
  const bodies = [
    ...SUPPORTED_ZERO_INITIAL_RIMES,
    ...INITIALS.flatMap((initial) =>
      [...SUPPORTED_RIMES_BY_INITIAL[initial]].map((rime) => `${initial}${rime}`),
    ),
  ];
  return [...new Set(bodies)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}
