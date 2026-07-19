import type { CatalogEntry, FrequencyBand, TokenId } from "../core/model.js";

export type CatalogEntryStatus = "provisional" | "reviewed" | "excluded";

export interface CatalogSourceRow {
  readonly text: string;
  readonly reading: string;
  readonly frequencyBand: FrequencyBand;
  readonly tags: readonly string[];
  readonly status: CatalogEntryStatus;
  readonly provenanceIds: readonly string[];
  readonly rowNumber: number;
}

export type CatalogErrorCode =
  | "missing-field"
  | "invalid-text"
  | "invalid-frequency-band"
  | "invalid-status"
  | "missing-provenance"
  | "unknown-provenance"
  | "reading-error"
  | "syllable-count-mismatch"
  | "duplicate-entry";

export interface CatalogValidationError {
  readonly code: CatalogErrorCode;
  readonly message: string;
  readonly rowNumber: number;
  readonly text: string | null;
  readonly field: string | null;
}

export interface CatalogCompilationResult {
  readonly entries: readonly CatalogEntry[];
  readonly errors: readonly CatalogValidationError[];
}

export interface TokenCoverage {
  readonly tokenId: TokenId;
  readonly occurrences: number;
  readonly entryCount: number;
}

export interface CoverageReport {
  readonly entryCount: number;
  readonly syllableCount: number;
  readonly tokenCoverage: readonly TokenCoverage[];
}
