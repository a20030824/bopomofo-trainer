import type {
  ReferenceCandidate,
  ReferenceSourceManifest,
  ReferenceSourceRow,
} from "../types.js";

export type ReadingToneNotation = "diacritic" | "explicit-digits" | "mixed";
export type ReferenceTabularFormat = "csv" | "json";
export type ReferenceTabularValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];
export type ReferenceTabularRecord = Readonly<Record<string, ReferenceTabularValue>>;
export type ReferenceRawReading = string | readonly string[];

export const REFERENCE_IMPORT_ERROR_CODES = [
  "unresolved_alternatives",
  "multiple_pronunciations",
  "missing_tone",
  "text_reading_syllable_mismatch",
  "invalid_frequency",
  "non_han_text",
  "unsupported_syllable",
  "duplicate_source_row_identity",
  "malformed_tabular_row",
  "missing_required_column",
  "invalid_source_row_identity",
  "invalid_source_record_url",
  "unknown_source",
  "invalid_level",
] as const;

export type ReferenceImportErrorCode =
  (typeof REFERENCE_IMPORT_ERROR_CODES)[number];

export type ReferenceImportStage =
  | "tabular-parse"
  | "adapter-map"
  | "deduplicate"
  | "reading-normalize"
  | "row-normalize"
  | "candidate-compile";

export type ReferenceImportDetailValue = string | number | boolean | null;

export interface ReferenceImportReason {
  readonly code: string;
  readonly field: string | null;
  readonly details: Readonly<Record<string, ReferenceImportDetailValue>>;
}

export interface ReferenceAdapterRow {
  readonly inputIndex: number;
  readonly sourceRowId: string;
  readonly text: string;
  readonly rawReading: ReferenceRawReading;
  readonly oralPerMillion: ReferenceTabularValue;
  readonly writtenPerMillion: ReferenceTabularValue;
  readonly level: ReferenceTabularValue;
  readonly levelOrdinal: ReferenceTabularValue;
  readonly domains: ReferenceTabularValue;
  readonly sourceRecordUrl: ReferenceTabularValue;
}

export interface ReferenceAdapterRowError {
  readonly inputIndex: number;
  readonly sourceRowId: string | null;
  readonly code: "malformed_tabular_row" | "missing_required_column";
  readonly message: string;
  readonly details: Readonly<Record<string, ReferenceImportDetailValue>>;
}

export type ReferenceAdapterRowResult =
  | { readonly ok: true; readonly row: ReferenceAdapterRow }
  | { readonly ok: false; readonly error: ReferenceAdapterRowError };

export interface ReferenceSourceAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly toneNotation: ReadingToneNotation;
  readonly domainSeparator: string;
  parse(input: string): readonly ReferenceAdapterRowResult[];
}

export interface ReferenceImportError {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly inputIndex: number;
  readonly sourceRowId: string | null;
  readonly rawReading: ReferenceRawReading | null;
  readonly normalizedReading: string | null;
  readonly adapterRow: ReferenceAdapterRow | null;
  readonly code: ReferenceImportErrorCode;
  readonly stage: ReferenceImportStage;
  readonly message: string;
  readonly reasons: readonly ReferenceImportReason[];
}

export interface ImportedReferenceRow {
  readonly sourceVersion: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly inputIndex: number;
  readonly rawReading: ReferenceRawReading;
  readonly normalizedReading: string;
  readonly adapterRow: ReferenceAdapterRow;
  readonly row: ReferenceSourceRow;
  readonly candidate: ReferenceCandidate;
  readonly reasons: readonly ReferenceImportReason[];
}

export interface ReferenceImportSummary {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceRowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly rejectedByReason: Readonly<Record<ReferenceImportErrorCode, number>>;
  readonly duplicateCount: number;
  readonly unresolvedPronunciationCount: number;
  readonly orderingReason: "source_input_order";
  readonly fallbackReason: "no_fallback";
  readonly stopReason: "end_of_input";
  readonly determinismDigest: string;
}

export interface ReferenceImportResult {
  readonly manifest: ReferenceSourceManifest;
  readonly accepted: readonly ImportedReferenceRow[];
  readonly errors: readonly ReferenceImportError[];
  readonly summary: ReferenceImportSummary;
}

export interface TabularColumnMap {
  readonly sourceRowId: string;
  readonly text: string;
  readonly reading: string;
  readonly oralPerMillion: string | null;
  readonly writtenPerMillion: string | null;
  readonly level: string | null;
  readonly levelOrdinal: string | null;
  readonly domains: string | null;
  readonly sourceRecordUrl: string | null;
}

export interface TabularReferenceAdapterConfig {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly format: ReferenceTabularFormat;
  readonly toneNotation: ReadingToneNotation;
  readonly columns: TabularColumnMap;
  readonly csvDelimiter: string;
  readonly domainSeparator: string;
  readonly sourceRecordUrlTemplate: string | null;
}
