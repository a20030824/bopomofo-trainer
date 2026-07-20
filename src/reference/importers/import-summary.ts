import { sha256Canonical } from "./canonical-json.js";
import {
  REFERENCE_IMPORT_ERROR_CODES,
  type ImportedReferenceRow,
  type ReferenceImportError,
  type ReferenceImportErrorCode,
  type ReferenceImportSummary,
  type ReferenceSourceAdapter,
} from "./types.js";
import type { ReferenceSourceManifest } from "../types.js";

function emptyReasonCounts(): Record<ReferenceImportErrorCode, number> {
  return Object.fromEntries(
    REFERENCE_IMPORT_ERROR_CODES.map((code) => [code, 0]),
  ) as Record<ReferenceImportErrorCode, number>;
}

function errorCodes(item: ReferenceImportError): readonly ReferenceImportErrorCode[] {
  return [...new Set([item.code, ...item.relatedCodes])];
}

export function buildReferenceImportSummary(
  manifest: ReferenceSourceManifest,
  adapter: ReferenceSourceAdapter,
  sourceRowCount: number,
  accepted: readonly ImportedReferenceRow[],
  errors: readonly ReferenceImportError[],
): ReferenceImportSummary {
  const rejectedByReason = emptyReasonCounts();
  for (const item of errors) {
    for (const code of errorCodes(item)) rejectedByReason[code] += 1;
  }
  const unresolvedCodes = new Set<ReferenceImportErrorCode>([
    "unresolved_alternatives",
    "multiple_pronunciations",
    "missing_tone",
    "unsupported_syllable",
  ]);
  const summaryWithoutDigest = {
    sourceId: adapter.sourceId,
    sourceVersion: adapter.sourceVersion,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    sourceRowCount,
    acceptedCount: accepted.length,
    rejectedCount: errors.length,
    rejectedByReason,
    duplicateCount: errors.filter((item) =>
      errorCodes(item).includes("duplicate_source_row_identity")
    ).length,
    unresolvedPronunciationCount: errors.filter((item) =>
      errorCodes(item).some((code) => unresolvedCodes.has(code))
    ).length,
    orderingReason: "source_input_order" as const,
    fallbackReason: "no_fallback" as const,
    stopReason: "end_of_input" as const,
  };
  return {
    ...summaryWithoutDigest,
    determinismDigest: sha256Canonical({
      manifest,
      accepted,
      errors,
      summary: summaryWithoutDigest,
    }),
  };
}
