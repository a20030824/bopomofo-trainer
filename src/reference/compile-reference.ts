import { parseReading } from "../scheme/parse-reading.js";
import type {
  ReferenceCandidate,
  ReferenceCompilationError,
  ReferenceCompilationResult,
  ReferenceSourceManifest,
  ReferenceSourceRow,
} from "./types.js";

function fail(
  row: ReferenceSourceRow,
  code: ReferenceCompilationError["code"],
  message: string,
): ReferenceCompilationResult {
  return {
    ok: false,
    error: {
      sourceId: row.sourceId,
      sourceRowId: row.sourceRowId,
      code,
      message,
    },
  };
}

function validNullableNumber(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

export function compileReferenceRow(
  row: ReferenceSourceRow,
  sources: Readonly<Record<string, ReferenceSourceManifest>>,
): ReferenceCompilationResult {
  if (sources[row.sourceId] === undefined) {
    return fail(row, "unknown-source", `unknown reference source: ${row.sourceId}`);
  }
  const text = row.text.normalize("NFC").trim();
  const reading = row.reading.normalize("NFC").trim().split(/\s+/u).join(" ");
  if (/[\/／]/u.test(text) || /[\/／]/u.test(reading)) {
    return fail(row, "unresolved-alternative", "reference row contains unresolved alternatives");
  }
  if (!/^\p{Script=Han}+$/u.test(text)) {
    return fail(row, "invalid-text", "reference candidate must contain Han characters only");
  }
  if (!validNullableNumber(row.oralPerMillion)
    || !validNullableNumber(row.writtenPerMillion)) {
    return fail(row, "invalid-frequency", "frequency must be finite and non-negative");
  }
  if (row.levelOrdinal !== null
    && (!Number.isInteger(row.levelOrdinal) || row.levelOrdinal < 0)) {
    return fail(row, "invalid-level", "level ordinal must be a non-negative integer");
  }

  const parsed = parseReading(reading);
  if (!parsed.ok) {
    return fail(
      row,
      "invalid-reading",
      parsed.errors.map((error) => error.message).join("; "),
    );
  }
  if ([...text].length !== parsed.syllables.length) {
    return fail(
      row,
      "syllable-count-mismatch",
      `text has ${[...text].length} Han characters but reading has ${parsed.syllables.length} syllables`,
    );
  }

  const candidate: ReferenceCandidate = {
    id: `reference:${row.sourceId}:${row.sourceRowId}`,
    sourceId: row.sourceId,
    sourceRowId: row.sourceRowId,
    text,
    reading,
    syllables: parsed.syllables,
    oralPerMillion: row.oralPerMillion,
    writtenPerMillion: row.writtenPerMillion,
    level: row.level,
    levelOrdinal: row.levelOrdinal,
    domains: [...new Set(row.domains.map((domain) => domain.trim()).filter(Boolean))]
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
    sourceRecordUrl: row.sourceRecordUrl,
    tokenCount: parsed.syllables.reduce(
      (total, syllable) => total + syllable.tokens.length,
      0,
    ),
    syllableCount: parsed.syllables.length,
  };
  return { ok: true, candidate };
}
