import type { Syllable } from "../core/model.js";
import { BOPOMOFO_SYMBOLS, TONES, toneToken, zhuyinToken, type Tone } from "./tokens.js";
import { isLegalSyllableBody } from "./syllable-grammar.js";

export type ReadingErrorCode =
  | "empty-reading"
  | "missing-tone"
  | "invalid-tone"
  | "unknown-symbol"
  | "illegal-syllable";

export interface ReadingParseError {
  readonly code: ReadingErrorCode;
  readonly message: string;
  readonly source: string;
  readonly syllableIndex: number | null;
}

export type ReadingParseResult =
  | { readonly ok: true; readonly syllables: readonly Syllable[] }
  | { readonly ok: false; readonly errors: readonly ReadingParseError[] };

function error(
  code: ReadingErrorCode,
  message: string,
  source: string,
  syllableIndex: number | null,
): ReadingParseError {
  return { code, message, source, syllableIndex };
}

function parseSyllable(source: string, syllableIndex: number): Syllable | ReadingParseError {
  const symbols = [...source];
  const last = symbols.at(-1);

  if (last === undefined || !/^[0-9]$/.test(last)) {
    return error(
      "missing-tone",
      `音節「${source}」必須以 1–5 的顯式聲調結尾`,
      source,
      syllableIndex,
    );
  }

  const numericTone = Number(last);
  if (!TONES.includes(numericTone as Tone)) {
    return error(
      "invalid-tone",
      `音節「${source}」的聲調必須是 1、2、3、4 或 5`,
      source,
      syllableIndex,
    );
  }

  const bodySymbols = symbols.slice(0, -1);
  if (bodySymbols.length === 0) {
    return error(
      "illegal-syllable",
      `音節「${source}」缺少注音符號`,
      source,
      syllableIndex,
    );
  }

  const unknown = bodySymbols.find((symbol) => !BOPOMOFO_SYMBOLS.has(symbol));
  if (unknown !== undefined) {
    return error(
      "unknown-symbol",
      `音節「${source}」包含未知符號「${unknown}」`,
      source,
      syllableIndex,
    );
  }

  const body = bodySymbols.join("");
  if (!isLegalSyllableBody(body)) {
    return error(
      "illegal-syllable",
      `音節「${source}」不是合法的國語注音組合`,
      source,
      syllableIndex,
    );
  }

  return {
    tokens: [
      ...bodySymbols.map(zhuyinToken),
      toneToken(numericTone as Tone),
    ],
  };
}

export function parseReading(reading: string): ReadingParseResult {
  const normalized = reading.trim();
  if (normalized.length === 0) {
    return {
      ok: false,
      errors: [error("empty-reading", "讀音不得為空", reading, null)],
    };
  }

  const sources = normalized.split(/\s+/u);
  const syllables: Syllable[] = [];
  const errors: ReadingParseError[] = [];

  sources.forEach((source, index) => {
    const parsed = parseSyllable(source, index);
    if ("tokens" in parsed) {
      syllables.push(parsed);
    } else {
      errors.push(parsed);
    }
  });

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, syllables };
}
