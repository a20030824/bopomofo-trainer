const INITIALS = [
  "zh",
  "ch",
  "sh",
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
] as const;

const INITIAL_BOPOMOFO: Readonly<Record<string, string>> = {
  b: "ㄅ",
  p: "ㄆ",
  m: "ㄇ",
  f: "ㄈ",
  d: "ㄉ",
  t: "ㄊ",
  n: "ㄋ",
  l: "ㄌ",
  g: "ㄍ",
  k: "ㄎ",
  h: "ㄏ",
  j: "ㄐ",
  q: "ㄑ",
  x: "ㄒ",
  zh: "ㄓ",
  ch: "ㄔ",
  sh: "ㄕ",
  r: "ㄖ",
  z: "ㄗ",
  c: "ㄘ",
  s: "ㄙ",
};

const FINAL_BOPOMOFO: Readonly<Record<string, string>> = {
  a: "ㄚ",
  o: "ㄛ",
  e: "ㄜ",
  ê: "ㄝ",
  ai: "ㄞ",
  ei: "ㄟ",
  ao: "ㄠ",
  ou: "ㄡ",
  an: "ㄢ",
  en: "ㄣ",
  ang: "ㄤ",
  eng: "ㄥ",
  er: "ㄦ",
  i: "ㄧ",
  ia: "ㄧㄚ",
  ie: "ㄧㄝ",
  iao: "ㄧㄠ",
  iu: "ㄧㄡ",
  iou: "ㄧㄡ",
  ian: "ㄧㄢ",
  in: "ㄧㄣ",
  iang: "ㄧㄤ",
  ing: "ㄧㄥ",
  iong: "ㄩㄥ",
  u: "ㄨ",
  ua: "ㄨㄚ",
  uo: "ㄨㄛ",
  uai: "ㄨㄞ",
  ui: "ㄨㄟ",
  uei: "ㄨㄟ",
  uan: "ㄨㄢ",
  un: "ㄨㄣ",
  uen: "ㄨㄣ",
  uang: "ㄨㄤ",
  ueng: "ㄨㄥ",
  ong: "ㄨㄥ",
  ü: "ㄩ",
  üe: "ㄩㄝ",
  üan: "ㄩㄢ",
  ün: "ㄩㄣ",
};

const Y_SYLLABLES: Readonly<Record<string, string>> = {
  yi: "ㄧ",
  ya: "ㄧㄚ",
  yo: "ㄧㄛ",
  ye: "ㄧㄝ",
  yai: "ㄧㄞ",
  yao: "ㄧㄠ",
  you: "ㄧㄡ",
  yan: "ㄧㄢ",
  yin: "ㄧㄣ",
  yang: "ㄧㄤ",
  ying: "ㄧㄥ",
  yong: "ㄩㄥ",
  yu: "ㄩ",
  yue: "ㄩㄝ",
  yuan: "ㄩㄢ",
  yun: "ㄩㄣ",
};

const W_SYLLABLES: Readonly<Record<string, string>> = {
  wu: "ㄨ",
  wa: "ㄨㄚ",
  wo: "ㄨㄛ",
  wai: "ㄨㄞ",
  wei: "ㄨㄟ",
  wan: "ㄨㄢ",
  wen: "ㄨㄣ",
  wang: "ㄨㄤ",
  weng: "ㄨㄥ",
};

const APICAL_I_INITIALS = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);
const PINYIN_SYLLABLE_PATTERN = /([A-Za-züÜvV:]+)([1-5])/gu;
const ALLOWED_SEPARATOR_PATTERN = /^[\s'’\-]*$/u;

export class PinyinConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinyinConversionError";
  }
}

interface NumberedPinyinSyllable {
  readonly body: string;
  readonly tone: number;
}

function normalizePinyinBody(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replaceAll("u:", "ü")
    .replaceAll("v", "ü");
}

function splitNumberedPinyin(value: string): readonly NumberedPinyinSyllable[] {
  const source = value.normalize("NFC").trim();
  if (source.length === 0) {
    throw new PinyinConversionError("pinyin reading is empty");
  }

  const syllables: NumberedPinyinSyllable[] = [];
  let cursor = 0;
  for (const match of source.matchAll(PINYIN_SYLLABLE_PATTERN)) {
    const index = match.index;
    const body = match[1];
    const toneSource = match[2];
    if (index === undefined || body === undefined || toneSource === undefined) {
      throw new PinyinConversionError(`cannot parse numbered pinyin: ${JSON.stringify(value)}`);
    }
    const separator = source.slice(cursor, index);
    if (!ALLOWED_SEPARATOR_PATTERN.test(separator)) {
      throw new PinyinConversionError(
        `unsupported pinyin separator ${JSON.stringify(separator)} in ${JSON.stringify(value)}`,
      );
    }
    syllables.push({ body: normalizePinyinBody(body), tone: Number(toneSource) });
    cursor = index + match[0].length;
  }

  const trailing = source.slice(cursor);
  if (syllables.length === 0 || !ALLOWED_SEPARATOR_PATTERN.test(trailing)) {
    throw new PinyinConversionError(`cannot parse numbered pinyin: ${JSON.stringify(value)}`);
  }
  return syllables;
}

function convertSyllableBody(body: string): string {
  const ySyllable = Y_SYLLABLES[body];
  if (ySyllable !== undefined) {
    return ySyllable;
  }
  const wSyllable = W_SYLLABLES[body];
  if (wSyllable !== undefined) {
    return wSyllable;
  }

  const initial = INITIALS.find((candidate) => body.startsWith(candidate)) ?? "";
  let final = body.slice(initial.length);
  if (["j", "q", "x"].includes(initial) && final.startsWith("u")) {
    final = `ü${final.slice(1)}`;
  }

  const initialBopomofo = initial.length === 0 ? "" : INITIAL_BOPOMOFO[initial];
  if (initial.length > 0 && initialBopomofo === undefined) {
    throw new PinyinConversionError(`unsupported pinyin initial: ${JSON.stringify(initial)}`);
  }

  if (final === "i" && APICAL_I_INITIALS.has(initial)) {
    return initialBopomofo ?? "";
  }

  const finalBopomofo = FINAL_BOPOMOFO[final];
  if (finalBopomofo === undefined) {
    throw new PinyinConversionError(
      `unsupported pinyin final ${JSON.stringify(final)} in syllable ${JSON.stringify(body)}`,
    );
  }
  return `${initialBopomofo ?? ""}${finalBopomofo}`;
}

export function numberedPinyinToTrainerReading(value: string): string {
  return splitNumberedPinyin(value)
    .map((syllable) => `${convertSyllableBody(syllable.body)}${syllable.tone}`)
    .join(" ");
}
