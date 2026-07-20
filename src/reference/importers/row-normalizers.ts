import type { ReferenceCompilationErrorCode } from "../types.js";
import type {
  ReferenceImportDetailValue,
  ReferenceImportErrorCode,
  ReferenceImportReason,
  ReferenceTabularValue,
} from "./types.js";

export function importReason(
  code: string,
  field: string | null,
  details: Readonly<Record<string, ReferenceImportDetailValue>>,
): ReferenceImportReason {
  return { code, field, details };
}

export function normalizeSourceRowIdentity(value: string): string {
  return value.normalize("NFC").trim();
}

export function parseNullableFrequency(
  value: ReferenceTabularValue,
  field: "oralPerMillion" | "writtenPerMillion",
):
  | { readonly ok: true; readonly value: number | null; readonly reason: ReferenceImportReason }
  | { readonly ok: false; readonly message: string; readonly reason: ReferenceImportReason } {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return {
      ok: true,
      value: null,
      reason: importReason("missing_frequency_preserved_as_null", field, { field }),
    };
  }
  if (typeof value === "object" || typeof value === "boolean") {
    return {
      ok: false,
      message: `${field} is not numeric`,
      reason: importReason("frequency_type_rejected", field, {
        field,
        valueType: typeof value === "object" ? "array" : typeof value,
      }),
    };
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      ok: false,
      message: `${field} must be finite and non-negative`,
      reason: importReason("frequency_value_rejected", field, {
        field,
        rawValue: typeof value === "string" ? value : parsed,
      }),
    };
  }
  return {
    ok: true,
    value: parsed,
    reason: importReason(parsed === 0 ? "zero_frequency_preserved" : "frequency_parsed", field, {
      field,
      value: parsed,
    }),
  };
}

export function parseNullableLevel(value: ReferenceTabularValue):
  | { readonly ok: true; readonly value: string | null; readonly reason: ReferenceImportReason }
  | { readonly ok: false; readonly message: string; readonly reason: ReferenceImportReason } {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return {
      ok: true,
      value: null,
      reason: importReason("missing_level_preserved_as_null", "level", {}),
    };
  }
  if (Array.isArray(value) || typeof value === "boolean") {
    return {
      ok: false,
      message: "level must be scalar text, a number, or null",
      reason: importReason("level_type_rejected", "level", {
        valueType: Array.isArray(value) ? "array" : typeof value,
      }),
    };
  }
  const normalized = String(value).normalize("NFC").trim();
  return {
    ok: true,
    value: normalized,
    reason: importReason("level_preserved", "level", { value: normalized }),
  };
}

export function parseNullableSourceRecordUrl(value: ReferenceTabularValue):
  | { readonly ok: true; readonly value: string | null; readonly reason: ReferenceImportReason }
  | { readonly ok: false; readonly message: string; readonly reason: ReferenceImportReason } {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return {
      ok: true,
      value: null,
      reason: importReason(
        "missing_source_record_url_preserved_as_null",
        "sourceRecordUrl",
        {},
      ),
    };
  }
  if (typeof value !== "string") {
    return {
      ok: false,
      message: "source record URL must be text or null",
      reason: importReason("source_record_url_type_rejected", "sourceRecordUrl", {
        valueType: Array.isArray(value) ? "array" : typeof value,
      }),
    };
  }
  const normalized = value.normalize("NFC").trim();
  return {
    ok: true,
    value: normalized,
    reason: importReason("source_record_url_preserved", "sourceRecordUrl", {
      value: normalized,
    }),
  };
}

export function parseLevelOrdinal(value: ReferenceTabularValue):
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly message: string; readonly reason: ReferenceImportReason } {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return { ok: true, value: null };
  }
  if (typeof value === "object" || typeof value === "boolean") {
    return {
      ok: false,
      message: "level ordinal must be an integer or null",
      reason: importReason("level_ordinal_type_rejected", "levelOrdinal", {
        valueType: typeof value === "object" ? "array" : typeof value,
      }),
    };
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      message: "level ordinal must be a non-negative integer",
      reason: importReason("level_ordinal_value_rejected", "levelOrdinal", {
        rawValue: typeof value === "string" ? value : parsed,
      }),
    };
  }
  return { ok: true, value: parsed };
}

export function parseDomains(
  value: ReferenceTabularValue,
  separator: string,
): { readonly value: readonly string[]; readonly reason: ReferenceImportReason } {
  const values = value === null
    ? []
    : (Array.isArray(value) ? value : String(value).split(separator));
  const normalized = [...new Set(
    values.map((item) => item.normalize("NFC").trim()).filter(Boolean),
  )].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return {
    value: normalized,
    reason: importReason("domains_sorted_and_deduplicated", "domains", {
      outputCount: normalized.length,
      ordering: "unicode_code_point",
    }),
  };
}

export function mapCompilationCode(
  code: ReferenceCompilationErrorCode,
): ReferenceImportErrorCode {
  switch (code) {
    case "unknown-source": return "unknown_source";
    case "invalid-source-row-id": return "invalid_source_row_identity";
    case "invalid-source-record-url": return "invalid_source_record_url";
    case "unresolved-alternative": return "unresolved_alternatives";
    case "invalid-text": return "non_han_text";
    case "invalid-reading": return "unsupported_syllable";
    case "syllable-count-mismatch": return "text_reading_syllable_mismatch";
    case "invalid-frequency": return "invalid_frequency";
    case "invalid-level": return "invalid_level";
  }
}
