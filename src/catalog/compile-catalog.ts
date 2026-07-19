import type { CatalogEntry, FrequencyBand } from "../core/model.js";
import { parseReading } from "../scheme/parse-reading.js";
import type {
  CatalogCompilationResult,
  CatalogEntryStatus,
  CatalogSourceRow,
  CatalogValidationError,
} from "./types.js";
import type { CsvRecord } from "./csv.js";

const REQUIRED_FIELDS = [
  "text",
  "reading",
  "frequency_band",
  "tags",
  "status",
  "provenance_ids",
] as const;

function issue(
  code: CatalogValidationError["code"],
  message: string,
  rowNumber: number,
  text: string | null,
  field: string | null,
): CatalogValidationError {
  return { code, message, rowNumber, text, field };
}

function splitList(value: string): string[] {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseSourceRow(record: CsvRecord):
  | { readonly ok: true; readonly row: CatalogSourceRow }
  | { readonly ok: false; readonly errors: readonly CatalogValidationError[] } {
  const errors: CatalogValidationError[] = [];
  const text = record.values.text ?? "";

  for (const field of REQUIRED_FIELDS) {
    if ((record.values[field] ?? "").length === 0) {
      errors.push(issue(
        "missing-field",
        `缺少必要欄位「${field}」`,
        record.rowNumber,
        text || null,
        field,
      ));
    }
  }

  if (text.length > 0 && !/^\p{Script=Han}+$/u.test(text)) {
    errors.push(issue(
      "invalid-text",
      "第一階段詞庫只接受純漢字詞目",
      record.rowNumber,
      text,
      "text",
    ));
  }

  const frequency = Number(record.values.frequency_band);
  if (![1, 2, 3].includes(frequency)) {
    errors.push(issue(
      "invalid-frequency-band",
      "frequency_band 必須是 1、2 或 3",
      record.rowNumber,
      text || null,
      "frequency_band",
    ));
  }

  const status = record.values.status as CatalogEntryStatus;
  if (!["provisional", "reviewed", "excluded"].includes(status)) {
    errors.push(issue(
      "invalid-status",
      "status 必須是 provisional、reviewed 或 excluded",
      record.rowNumber,
      text || null,
      "status",
    ));
  }

  const provenanceIds = splitList(record.values.provenance_ids ?? "");
  if (provenanceIds.length === 0) {
    errors.push(issue(
      "missing-provenance",
      "每筆詞目至少需要一個 provenance ID",
      record.rowNumber,
      text || null,
      "provenance_ids",
    ));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      text,
      reading: record.values.reading ?? "",
      frequencyBand: frequency as FrequencyBand,
      tags: splitList(record.values.tags ?? ""),
      status,
      provenanceIds,
      rowNumber: record.rowNumber,
    },
  };
}

function compileRow(row: CatalogSourceRow):
  | { readonly ok: true; readonly entry: CatalogEntry | null }
  | { readonly ok: false; readonly errors: readonly CatalogValidationError[] } {
  if (row.status === "excluded") {
    return { ok: true, entry: null };
  }

  const parsed = parseReading(row.reading);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((readingError) => issue(
        "reading-error",
        readingError.message,
        row.rowNumber,
        row.text,
        "reading",
      )),
    };
  }

  if ([...row.text].length !== parsed.syllables.length) {
    return {
      ok: false,
      errors: [issue(
        "syllable-count-mismatch",
        `詞目有 ${[...row.text].length} 個漢字，但讀音有 ${parsed.syllables.length} 個音節`,
        row.rowNumber,
        row.text,
        "reading",
      )],
    };
  }

  return {
    ok: true,
    entry: {
      id: `word:${row.text}:${row.reading.replace(/\s+/gu, "-")}`,
      prompt: { text: row.text, locale: "zh-TW" },
      syllables: parsed.syllables,
      frequencyBand: row.frequencyBand,
      tags: row.tags,
      provenanceIds: row.provenanceIds,
    },
  };
}

export function compileCatalog(records: readonly CsvRecord[]): CatalogCompilationResult {
  const entries: CatalogEntry[] = [];
  const errors: CatalogValidationError[] = [];
  const identities = new Map<string, number>();

  for (const record of records) {
    const source = parseSourceRow(record);
    if (!source.ok) {
      errors.push(...source.errors);
      continue;
    }

    const identity = `${source.row.text}\u0000${source.row.reading}`;
    const previousRow = identities.get(identity);
    if (previousRow !== undefined) {
      errors.push(issue(
        "duplicate-entry",
        `與第 ${previousRow} 列重複`,
        source.row.rowNumber,
        source.row.text,
        null,
      ));
      continue;
    }
    identities.set(identity, source.row.rowNumber);

    const compiled = compileRow(source.row);
    if (!compiled.ok) {
      errors.push(...compiled.errors);
    } else if (compiled.entry !== null) {
      entries.push(compiled.entry);
    }
  }

  return { entries, errors };
}
