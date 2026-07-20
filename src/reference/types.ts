import type { Syllable } from "../core/model.js";

export type RedistributionStatus =
  | "redistributable"
  | "local-only"
  | "unconfirmed";

export interface ReferenceSourceManifest {
  readonly id: string;
  readonly title: string;
  readonly version: string;
  readonly homepageUrl: string;
  readonly downloadUrl: string | null;
  readonly retrievedAt: string | null;
  readonly checksumSha256: string | null;
  readonly licenseLabel: string;
  readonly redistributionStatus: RedistributionStatus;
  readonly notes: readonly string[];
}

export interface ReferenceSourceRow {
  readonly sourceId: string;
  readonly sourceRowId: string;
  readonly text: string;
  readonly reading: string;
  readonly oralPerMillion: number | null;
  readonly writtenPerMillion: number | null;
  readonly level: string | null;
  readonly levelOrdinal: number | null;
  readonly domains: readonly string[];
  readonly sourceRecordUrl: string | null;
}

export interface ReferenceCandidate {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceRowId: string;
  readonly text: string;
  readonly reading: string;
  readonly syllables: readonly Syllable[];
  readonly oralPerMillion: number | null;
  readonly writtenPerMillion: number | null;
  readonly level: string | null;
  readonly levelOrdinal: number | null;
  readonly domains: readonly string[];
  readonly sourceRecordUrl: string | null;
  readonly tokenCount: number;
  readonly syllableCount: number;
}

export type ReferenceCompilationErrorCode =
  | "unknown-source"
  | "invalid-source-row-id"
  | "invalid-source-record-url"
  | "unresolved-alternative"
  | "invalid-text"
  | "invalid-reading"
  | "syllable-count-mismatch"
  | "invalid-frequency"
  | "invalid-level";

export interface ReferenceCompilationError {
  readonly sourceId: string;
  readonly sourceRowId: string;
  readonly code: ReferenceCompilationErrorCode;
  readonly message: string;
}

export type ReferenceCompilationResult =
  | { readonly ok: true; readonly candidate: ReferenceCandidate }
  | { readonly ok: false; readonly error: ReferenceCompilationError };
