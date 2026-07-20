import { parseReading } from "../../scheme/parse-reading.js";
import type {
  ReadingToneNotation,
  ReferenceImportReason,
  ReferenceRawReading,
} from "./types.js";

const TONE_MARKS: Readonly<Record<string, number>> = {
  "ˉ": 1,
  "ˊ": 2,
  "ˇ": 3,
  "ˋ": 4,
  "˙": 5,
};

export type ReferenceReadingNormalizationResult =
  | {
    readonly ok: true;
    readonly rawReading: ReferenceRawReading;
    readonly normalizedReading: string;
    readonly reasons: readonly ReferenceImportReason[];
  }
  | {
    readonly ok: false;
    readonly code:
      | "unresolved_alternatives"
      | "multiple_pronunciations"
      | "missing_tone"
      | "unsupported_syllable";
    readonly rawReading: ReferenceRawReading;
    readonly normalizedReading: string | null;
    readonly message: string;
    readonly reasons: readonly ReferenceImportReason[];
  };

function reason(
  code: string,
  field: string | null,
  details: Readonly<Record<string, string | number | boolean | null>>,
): ReferenceImportReason {
  return { code, field, details };
}

function fail(
  code: "unresolved_alternatives" | "multiple_pronunciations" | "missing_tone" | "unsupported_syllable",
  rawReading: ReferenceRawReading,
  normalizedReading: string | null,
  message: string,
  reasons: readonly ReferenceImportReason[],
): ReferenceReadingNormalizationResult {
  return { ok: false, code, rawReading, normalizedReading, message, reasons };
}

function normalizeSyllable(
  source: string,
  notation: ReadingToneNotation,
  syllableIndex: number,
):
  | { readonly ok: true; readonly syllable: string; readonly reason: ReferenceImportReason }
  | { readonly ok: false; readonly code: "missing_tone" | "unsupported_syllable"; readonly message: string; readonly reason: ReferenceImportReason } {
  const normalized = source.normalize("NFC");
  const characters = [...normalized];
  const toneMarks = characters.filter((character) => TONE_MARKS[character] !== undefined);
  const final = characters.at(-1);
  const explicitTone = final !== undefined && /^[1-5]$/u.test(final)
    ? Number(final)
    : null;

  if (toneMarks.length > 1) {
    return {
      ok: false,
      code: "unsupported_syllable",
      message: `syllable ${syllableIndex} contains multiple tone marks`,
      reason: reason("multiple_tone_marks", "reading", {
        syllableIndex,
        source: normalized,
        toneMarkCount: toneMarks.length,
      }),
    };
  }
  if (explicitTone !== null && toneMarks.length === 1) {
    return {
      ok: false,
      code: "unsupported_syllable",
      message: `syllable ${syllableIndex} mixes digit and diacritic tone encodings`,
      reason: reason("conflicting_tone_encodings", "reading", {
        syllableIndex,
        source: normalized,
      }),
    };
  }
  if (notation === "explicit-digits" && toneMarks.length === 1) {
    return {
      ok: false,
      code: "unsupported_syllable",
      message: `syllable ${syllableIndex} uses a tone mark in an explicit-digit source`,
      reason: reason("tone_notation_mismatch", "reading", {
        syllableIndex,
        notation,
        source: normalized,
      }),
    };
  }
  if (notation === "diacritic" && explicitTone !== null) {
    return {
      ok: false,
      code: "unsupported_syllable",
      message: `syllable ${syllableIndex} uses a tone digit in a diacritic source`,
      reason: reason("tone_notation_mismatch", "reading", {
        syllableIndex,
        notation,
        source: normalized,
      }),
    };
  }

  if (explicitTone !== null) {
    const body = characters.slice(0, -1).join("");
    return {
      ok: true,
      syllable: `${body}${explicitTone}`,
      reason: reason("explicit_tone_preserved", "reading", {
        syllableIndex,
        tone: explicitTone,
      }),
    };
  }

  if (toneMarks.length === 1) {
    const mark = toneMarks[0]!;
    const tone = TONE_MARKS[mark]!;
    const body = characters.filter((character) => character !== mark).join("");
    return {
      ok: true,
      syllable: `${body}${tone}`,
      reason: reason("tone_mark_normalized", "reading", {
        syllableIndex,
        sourceMark: mark,
        tone,
      }),
    };
  }

  if (notation === "diacritic") {
    return {
      ok: true,
      syllable: `${normalized}1`,
      reason: reason("unmarked_first_tone_normalized", "reading", {
        syllableIndex,
        tone: 1,
      }),
    };
  }

  return {
    ok: false,
    code: "missing_tone",
    message: `syllable ${syllableIndex} has no explicit tone under ${notation} notation`,
    reason: reason("tone_not_explicit", "reading", {
      syllableIndex,
      notation,
      source: normalized,
    }),
  };
}

export function normalizeReferenceReading(
  rawReading: ReferenceRawReading,
  notation: ReadingToneNotation,
): ReferenceReadingNormalizationResult {
  const originalRawReading = rawReading;
  let sourceValue: string;
  if (typeof rawReading !== "string") {
    if (rawReading.length === 0) {
      return fail(
        "missing_tone",
        rawReading,
        null,
        "reading array is empty",
        [reason("reading_array_empty", "reading", { pronunciationCount: 0 })],
      );
    }
    if (rawReading.length > 1) {
      return fail(
        "multiple_pronunciations",
        rawReading,
        null,
        "reading contains multiple pronunciation values",
        [reason("reading_array_has_multiple_values", "reading", {
          pronunciationCount: rawReading.length,
        })],
      );
    }
    sourceValue = rawReading[0]!;
  } else {
    sourceValue = rawReading;
  }

  const source = sourceValue.normalize("NFC").trim();
  if (/[\/／]/u.test(source)) {
    return fail(
      "unresolved_alternatives",
      originalRawReading,
      null,
      "reading contains an unresolved slash alternative",
      [reason("slash_alternative_not_resolved", "reading", { source })],
    );
  }
  if (/[;；|\n\r]/u.test(source)) {
    return fail(
      "multiple_pronunciations",
      originalRawReading,
      null,
      "reading contains multiple pronunciation branches",
      [reason("pronunciation_branch_separator_found", "reading", { source })],
    );
  }
  if (source.length === 0) {
    return fail(
      "missing_tone",
      originalRawReading,
      null,
      "reading is empty",
      [reason("empty_reading", "reading", {})],
    );
  }

  const syllables = source.split(/\s+/u);
  const normalized: string[] = [];
  const reasons: ReferenceImportReason[] = [];
  for (let index = 0; index < syllables.length; index += 1) {
    const result = normalizeSyllable(syllables[index]!, notation, index);
    reasons.push(result.reason);
    if (!result.ok) {
      return fail(result.code, originalRawReading, normalized.length > 0 ? normalized.join(" ") : null, result.message, reasons);
    }
    normalized.push(result.syllable);
  }

  const normalizedReading = normalized.join(" ");
  const parsed = parseReading(normalizedReading);
  if (!parsed.ok) {
    const first = parsed.errors[0]!;
    return fail(
      first.code === "missing-tone" ? "missing_tone" : "unsupported_syllable",
      originalRawReading,
      normalizedReading,
      parsed.errors.map((error) => error.message).join("; "),
      [
        ...reasons,
        reason("shared_reading_parser_rejected", "reading", {
          parserCode: first.code,
          syllableIndex: first.syllableIndex,
        }),
      ],
    );
  }

  return {
    ok: true,
    rawReading: originalRawReading,
    normalizedReading,
    reasons,
  };
}
