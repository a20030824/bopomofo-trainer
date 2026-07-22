import type { CatalogCommonnessBase } from "../core/model.js";

export type CommonnessIdentityStatus = "reviewed" | "unresolved";

export interface CommonnessEvidence {
  readonly catalogEntryId: string;
  // The catalog text this entry practices. A heteronym text can produce
  // several catalogEntryIds (one per reading) that legitimately share one
  // source row; catalogText lets the projector tell that apart from two
  // unrelated entries accidentally sharing a source row.
  readonly catalogText: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceRowId: string;
  readonly spokenPerMillion: number | null;
  readonly writtenPerMillion: number | null;
  readonly identityStatus: CommonnessIdentityStatus;
}

export interface CommonnessModelConfig {
  readonly version: string;
  readonly spokenWeight: number;
  readonly writtenWeight: number;
  readonly minimumSelectionWeight: number;
}

export interface CommonnessNormalizationAnchors {
  readonly spokenPerMillionMaximum: number;
  readonly writtenPerMillionMaximum: number;
}

export type CommonnessExclusionCode =
  | "unresolved_identity"
  | "duplicate_catalog_identity"
  | "shared_source_row_identity"
  | "invalid_frequency"
  | "missing_frequency";

export interface CommonnessProjectionExclusion {
  readonly catalogEntryId: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceRowId: string;
  readonly code: CommonnessExclusionCode;
  readonly details: string;
}

export interface ProjectedCatalogCommonness {
  readonly catalogEntryId: string;
  readonly base: CatalogCommonnessBase;
}

export interface CommonnessProjection {
  readonly modelVersion: string;
  readonly config: CommonnessModelConfig;
  readonly anchors: CommonnessNormalizationAnchors;
  readonly entries: readonly ProjectedCatalogCommonness[];
  readonly exclusions: readonly CommonnessProjectionExclusion[];
  readonly determinismDigest: string;
}
