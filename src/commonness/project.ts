import { createHash } from "node:crypto";
import type { CatalogCommonnessBase } from "../core/model.js";
import type {
  CommonnessEvidence,
  CommonnessModelConfig,
  CommonnessNormalizationAnchors,
  CommonnessProjection,
  CommonnessProjectionExclusion,
  ProjectedCatalogCommonness,
} from "./types.js";

export const COMMONNESS_MODEL_V1: CommonnessModelConfig = {
  version: "commonness-v1",
  spokenWeight: 0.6,
  writtenWeight: 0.4,
  minimumSelectionWeight: 0.05,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceOrder(left: CommonnessEvidence, right: CommonnessEvidence): number {
  return compareText(left.catalogEntryId, right.catalogEntryId)
    || compareText(left.sourceId, right.sourceId)
    || compareText(left.sourceVersion, right.sourceVersion)
    || compareText(left.sourceRowId, right.sourceRowId);
}

function exclusionOrder(
  left: CommonnessProjectionExclusion,
  right: CommonnessProjectionExclusion,
): number {
  return compareText(left.catalogEntryId, right.catalogEntryId)
    || compareText(left.code, right.code)
    || compareText(left.sourceId, right.sourceId)
    || compareText(left.sourceVersion, right.sourceVersion)
    || compareText(left.sourceRowId, right.sourceRowId);
}

function validateConfig(config: CommonnessModelConfig): void {
  if (config.version.trim().length === 0) {
    throw new TypeError("commonness model version must not be empty");
  }
  for (const weight of [config.spokenWeight, config.writtenWeight]) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError("commonness channel weights must be finite and non-negative");
    }
  }
  if (config.spokenWeight + config.writtenWeight <= 0) {
    throw new RangeError("at least one commonness channel weight must be positive");
  }
  if (!Number.isFinite(config.minimumSelectionWeight)
    || config.minimumSelectionWeight <= 0
    || config.minimumSelectionWeight > 1) {
    throw new RangeError("minimum selection weight must be in (0, 1]");
  }
}

function validFrequency(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

function sourceRowKey(evidence: CommonnessEvidence): string {
  return `${evidence.sourceId}\u0000${evidence.sourceVersion}\u0000${evidence.sourceRowId}`;
}

function exclusion(
  evidence: CommonnessEvidence,
  code: CommonnessProjectionExclusion["code"],
  details: string,
): CommonnessProjectionExclusion {
  return {
    catalogEntryId: evidence.catalogEntryId,
    sourceId: evidence.sourceId,
    sourceVersion: evidence.sourceVersion,
    sourceRowId: evidence.sourceRowId,
    code,
    details,
  };
}

function normalizeFrequency(value: number | null, maximum: number): number | null {
  if (value === null) return null;
  if (maximum <= 0) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(maximum));
}

function anchors(evidence: readonly CommonnessEvidence[]): CommonnessNormalizationAnchors {
  return {
    spokenPerMillionMaximum: Math.max(0, ...evidence.map((item) => item.spokenPerMillion ?? 0)),
    writtenPerMillionMaximum: Math.max(0, ...evidence.map((item) => item.writtenPerMillion ?? 0)),
  };
}

function baseFor(
  evidence: CommonnessEvidence,
  config: CommonnessModelConfig,
  normalization: CommonnessNormalizationAnchors,
): CatalogCommonnessBase {
  const spokenStrength = normalizeFrequency(
    evidence.spokenPerMillion,
    normalization.spokenPerMillionMaximum,
  );
  const writtenStrength = normalizeFrequency(
    evidence.writtenPerMillion,
    normalization.writtenPerMillionMaximum,
  );
  let weighted = 0;
  let availableWeight = 0;
  if (spokenStrength !== null && config.spokenWeight > 0) {
    weighted += spokenStrength * config.spokenWeight;
    availableWeight += config.spokenWeight;
  }
  if (writtenStrength !== null && config.writtenWeight > 0) {
    weighted += writtenStrength * config.writtenWeight;
    availableWeight += config.writtenWeight;
  }
  const score = availableWeight === 0 ? 0 : weighted / availableWeight;
  const selectionWeight = config.minimumSelectionWeight
    + score * (1 - config.minimumSelectionWeight);
  const reasons = spokenStrength !== null && writtenStrength !== null
    ? ["reviewed_identity", "spoken_and_written_frequency"]
    : spokenStrength !== null
    ? ["reviewed_identity", "spoken_frequency_only"]
    : ["reviewed_identity", "written_frequency_only"];
  return {
    modelVersion: config.version,
    sourceId: evidence.sourceId,
    sourceVersion: evidence.sourceVersion,
    sourceRowId: evidence.sourceRowId,
    spokenPerMillion: evidence.spokenPerMillion,
    writtenPerMillion: evidence.writtenPerMillion,
    spokenStrength,
    writtenStrength,
    score,
    selectionWeight,
    confidence: "reviewed",
    reasons,
  };
}

function projectionPayload(
  config: CommonnessModelConfig,
  normalization: CommonnessNormalizationAnchors,
  entries: readonly ProjectedCatalogCommonness[],
  exclusions: readonly CommonnessProjectionExclusion[],
): Omit<CommonnessProjection, "determinismDigest"> {
  return {
    modelVersion: config.version,
    config,
    anchors: normalization,
    entries,
    exclusions,
  };
}

export function serializeCommonnessProjection(projection: CommonnessProjection): string {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

export function projectCommonness(
  input: readonly CommonnessEvidence[],
  config: CommonnessModelConfig = COMMONNESS_MODEL_V1,
): CommonnessProjection {
  validateConfig(config);
  const sorted = [...input].sort(evidenceOrder);
  const excluded = new Map<number, CommonnessProjectionExclusion>();

  const catalogCounts = new Map<string, number>();
  const sourceRows = new Map<string, Set<string>>();
  for (const evidence of sorted) {
    catalogCounts.set(evidence.catalogEntryId, (catalogCounts.get(evidence.catalogEntryId) ?? 0) + 1);
    const ids = sourceRows.get(sourceRowKey(evidence)) ?? new Set<string>();
    ids.add(evidence.catalogEntryId);
    sourceRows.set(sourceRowKey(evidence), ids);
  }

  sorted.forEach((evidence, index) => {
    if ((catalogCounts.get(evidence.catalogEntryId) ?? 0) > 1) {
      excluded.set(index, exclusion(
        evidence,
        "duplicate_catalog_identity",
        "catalog identity appears more than once in the projection input",
      ));
      return;
    }
    if ((sourceRows.get(sourceRowKey(evidence))?.size ?? 0) > 1) {
      excluded.set(index, exclusion(
        evidence,
        "shared_source_row_identity",
        "one source row maps to multiple catalog identities",
      ));
      return;
    }
    if (evidence.identityStatus !== "reviewed") {
      excluded.set(index, exclusion(
        evidence,
        "unresolved_identity",
        "catalog identity has not been reviewed",
      ));
      return;
    }
    if (!validFrequency(evidence.spokenPerMillion)
      || !validFrequency(evidence.writtenPerMillion)) {
      excluded.set(index, exclusion(
        evidence,
        "invalid_frequency",
        "frequency must be null or a finite non-negative number",
      ));
      return;
    }
    if (evidence.spokenPerMillion === null && evidence.writtenPerMillion === null) {
      excluded.set(index, exclusion(
        evidence,
        "missing_frequency",
        "both spoken and written frequency are missing",
      ));
    }
  });

  const acceptedEvidence = sorted.filter((_, index) => !excluded.has(index));
  const normalization = anchors(acceptedEvidence);
  const entries = acceptedEvidence.map((evidence) => ({
    catalogEntryId: evidence.catalogEntryId,
    base: baseFor(evidence, config, normalization),
  }));
  const exclusions = [...excluded.values()].sort(exclusionOrder);
  const payload = projectionPayload(config, normalization, entries, exclusions);
  const determinismDigest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return { ...payload, determinismDigest };
}
