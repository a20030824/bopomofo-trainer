import { createHash } from "node:crypto";
import type { CsvRecord } from "../catalog/csv.js";
import { numberedPinyinToTrainerReading } from "./pinyin-to-bopomofo.js";

export const READING_RESOLUTION_MODEL_VERSION = "catalog-reading-resolution-v1";

export type ReadingSourceKind = "moe-concised" | "moe-revised" | "cedict" | "manual";
export type ReadingConfidence = "authoritative" | "provisional" | "fallback" | "reviewed";

export interface ReadingResolutionRow {
  readonly text: string;
  readonly originalReading: string;
  readonly resolvedReading: string;
  readonly sourceKind: ReadingSourceKind;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly evidenceId: string;
  readonly sourceReading: string;
  readonly confidence: ReadingConfidence;
  readonly changed: boolean;
  readonly reasons: readonly string[];
}

export interface ReadingResolutionReport {
  readonly modelVersion: typeof READING_RESOLUTION_MODEL_VERSION;
  readonly candidateCount: number;
  readonly counts: Readonly<Record<ReadingSourceKind, number>>;
  readonly changedTexts: readonly string[];
  readonly rows: readonly ReadingResolutionRow[];
  readonly determinismDigest: string;
}

export interface CatalogReadingResolutionResult {
  readonly records: readonly CsvRecord[];
  readonly report: ReadingResolutionReport;
}

export interface CatalogReadingResolutionInput {
  readonly catalogRecords: readonly CsvRecord[];
  readonly moeConcisedProjection: unknown;
  readonly moeRevisedProjection: unknown;
  readonly cedictProjection: unknown;
  readonly manualOverrides: unknown;
}

export class CatalogReadingResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogReadingResolutionError";
  }
}

interface ResolutionEvidence {
  readonly resolvedReading: string;
  readonly sourceKind: ReadingSourceKind;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly evidenceId: string;
  readonly sourceReading: string;
  readonly confidence: ReadingConfidence;
  readonly reasons: readonly string[];
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CatalogReadingResolutionError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CatalogReadingResolutionError(`${label} must be a non-empty string`);
  }
  return value;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CatalogReadingResolutionError(`${label} must be a finite number`);
  }
  return value;
}

function arrayValue(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CatalogReadingResolutionError(`${label} must be an array`);
  }
  return value;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

function normalizeReading(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .join(" ");
}

function splitProvenance(value: string): string[] {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function activeCatalogRows(records: readonly CsvRecord[]): Map<string, CsvRecord> {
  const rows = new Map<string, CsvRecord>();
  for (const record of records) {
    if ((record.values.status ?? "") === "excluded") {
      continue;
    }
    const text = normalizeText(record.values.text ?? "");
    if (text.length === 0) {
      throw new CatalogReadingResolutionError(`catalog row ${record.rowNumber} is missing text`);
    }
    if (rows.has(text)) {
      throw new CatalogReadingResolutionError(`duplicate active catalog text: ${text}`);
    }
    rows.set(text, record);
  }
  return rows;
}

function addEvidence(
  resolved: Map<string, ResolutionEvidence>,
  activeTexts: ReadonlySet<string>,
  text: string,
  evidence: ResolutionEvidence,
): void {
  if (!activeTexts.has(text)) {
    throw new CatalogReadingResolutionError(`reading evidence targets unknown catalog text: ${text}`);
  }
  const previous = resolved.get(text);
  if (previous !== undefined) {
    throw new CatalogReadingResolutionError(
      `reading evidence overlap for ${text}: ${previous.sourceKind} and ${evidence.sourceKind}`,
    );
  }
  resolved.set(text, evidence);
}

function readSource(root: Record<string, unknown>, label: string): {
  readonly sourceId: string;
  readonly sourceVersion: string;
} {
  const source = objectValue(root.source, `${label}.source`);
  return {
    sourceId: stringValue(source.sourceId, `${label}.source.sourceId`),
    sourceVersion: stringValue(source.sourceVersion, `${label}.source.sourceVersion`),
  };
}

function applyMoeConcised(
  projection: unknown,
  resolved: Map<string, ResolutionEvidence>,
  activeTexts: ReadonlySet<string>,
): void {
  const root = objectValue(projection, "MOE Concised projection");
  if (root.adapterVersion !== "moe-concised-reading-adapter-v1") {
    throw new CatalogReadingResolutionError("unsupported MOE Concised projection adapter version");
  }
  const candidateSet = objectValue(root.candidateSet, "MOE Concised projection.candidateSet");
  if (numberValue(candidateSet.entryCount, "MOE Concised candidate entry count") !== activeTexts.size) {
    throw new CatalogReadingResolutionError("MOE Concised projection candidate count mismatch");
  }
  const source = readSource(root, "MOE Concised projection");
  for (const [index, value] of arrayValue(root.rows, "MOE Concised projection.rows").entries()) {
    const row = objectValue(value, `MOE Concised row ${index}`);
    const text = normalizeText(stringValue(row.lookupText, `MOE Concised row ${index}.lookupText`));
    const reading = normalizeReading(
      stringValue(row.trainerReading, `MOE Concised row ${index}.trainerReading`),
    );
    const entryId = stringValue(row.sourceEntryId, `MOE Concised row ${index}.sourceEntryId`);
    addEvidence(resolved, activeTexts, text, {
      resolvedReading: reading,
      sourceKind: "moe-concised",
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      evidenceId: entryId,
      sourceReading: reading,
      confidence: "authoritative",
      reasons: ["MOE Concised exact headword has one accepted reading"],
    });
  }
}

function applyMoeRevised(
  projection: unknown,
  resolved: Map<string, ResolutionEvidence>,
  activeTexts: ReadonlySet<string>,
): void {
  const root = objectValue(projection, "MOE Revised projection");
  if (root.adapterVersion !== "moe-revised-reading-fallback-adapter-v1") {
    throw new CatalogReadingResolutionError("unsupported MOE Revised projection adapter version");
  }
  const source = readSource(root, "MOE Revised projection");
  const fallbackBasis = objectValue(root.fallbackBasis, "MOE Revised projection.fallbackBasis");
  const fallbackTexts = new Set(
    arrayValue(fallbackBasis.fallbackCandidateTexts, "MOE Revised fallback candidates")
      .map((value, index) => normalizeText(stringValue(value, `MOE Revised fallback ${index}`))),
  );
  for (const [index, value] of arrayValue(root.rows, "MOE Revised projection.rows").entries()) {
    const row = objectValue(value, `MOE Revised row ${index}`);
    const text = normalizeText(stringValue(row.lookupText, `MOE Revised row ${index}.lookupText`));
    if (!fallbackTexts.has(text)) {
      throw new CatalogReadingResolutionError(`MOE Revised row is outside its fallback basis: ${text}`);
    }
    if (row.fallbackStatus !== "provisional") {
      throw new CatalogReadingResolutionError(`MOE Revised row is not provisional: ${text}`);
    }
    const reading = normalizeReading(
      stringValue(row.trainerReading, `MOE Revised row ${index}.trainerReading`),
    );
    const entryId = stringValue(row.sourceEntryId, `MOE Revised row ${index}.sourceEntryId`);
    addEvidence(resolved, activeTexts, text, {
      resolvedReading: reading,
      sourceKind: "moe-revised",
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      evidenceId: entryId,
      sourceReading: reading,
      confidence: "provisional",
      reasons: ["MOE Revised exact headword has one fallback reading"],
    });
  }
}

function applyCedict(
  projection: unknown,
  resolved: Map<string, ResolutionEvidence>,
  activeTexts: ReadonlySet<string>,
): void {
  const root = objectValue(projection, "CC-CEDICT projection");
  if (root.adapterVersion !== "cedict-identity-hints-adapter-v1") {
    throw new CatalogReadingResolutionError("unsupported CC-CEDICT projection adapter version");
  }
  const source = readSource(root, "CC-CEDICT projection");
  const resolutionBasis = objectValue(root.resolutionBasis, "CC-CEDICT projection.resolutionBasis");
  const targetTexts = new Set(
    arrayValue(resolutionBasis.cedictTargetTexts, "CC-CEDICT target texts")
      .map((value, index) => normalizeText(stringValue(value, `CC-CEDICT target ${index}`))),
  );
  const unresolvedAfterMoe = new Set([...activeTexts].filter((text) => !resolved.has(text)));
  if (!sameSet(targetTexts, unresolvedAfterMoe)) {
    throw new CatalogReadingResolutionError(
      `CC-CEDICT target set does not match MOE-unresolved catalog texts: expected ${sorted(unresolvedAfterMoe).join(", ")}`,
    );
  }

  const seenRows = new Set<string>();
  for (const [index, value] of arrayValue(root.rows, "CC-CEDICT projection.rows").entries()) {
    const row = objectValue(value, `CC-CEDICT row ${index}`);
    const text = normalizeText(stringValue(row.lookupText, `CC-CEDICT row ${index}.lookupText`));
    if (!targetTexts.has(text)) {
      throw new CatalogReadingResolutionError(`CC-CEDICT row is outside its target set: ${text}`);
    }
    if (seenRows.has(text)) {
      throw new CatalogReadingResolutionError(`duplicate CC-CEDICT projection row: ${text}`);
    }
    seenRows.add(text);
    const status = stringValue(row.status, `CC-CEDICT row ${index}.status`);
    const records = arrayValue(row.records, `CC-CEDICT row ${index}.records`);
    if (status === "ambiguous-records") {
      if (records.length < 2) {
        throw new CatalogReadingResolutionError(`ambiguous CC-CEDICT row has fewer than two records: ${text}`);
      }
      continue;
    }
    if (status !== "unique-record" || records.length !== 1) {
      throw new CatalogReadingResolutionError(`invalid CC-CEDICT row status or record count: ${text}`);
    }
    const record = objectValue(records[0], `CC-CEDICT row ${index}.records[0]`);
    const pinyin = stringValue(record.pinyin, `CC-CEDICT row ${index}.records[0].pinyin`);
    const sourceLine = numberValue(
      record.sourceLine,
      `CC-CEDICT row ${index}.records[0].sourceLine`,
    );
    const reading = numberedPinyinToTrainerReading(pinyin);
    addEvidence(resolved, activeTexts, text, {
      resolvedReading: reading,
      sourceKind: "cedict",
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      evidenceId: `line:${sourceLine}`,
      sourceReading: pinyin,
      confidence: "fallback",
      reasons: ["CC-CEDICT has one exact candidate record after both MOE sources were unresolved"],
    });
  }
}

function applyManualOverrides(
  overrides: unknown,
  resolved: Map<string, ResolutionEvidence>,
  activeTexts: ReadonlySet<string>,
): void {
  const root = objectValue(overrides, "manual reading overrides");
  if (root.version !== "manual-reading-overrides-v1") {
    throw new CatalogReadingResolutionError("unsupported manual reading override version");
  }
  const provenanceId = stringValue(root.provenanceId, "manual reading overrides.provenanceId");
  const sourceVersion = stringValue(root.sourceVersion, "manual reading overrides.sourceVersion");
  const rows = arrayValue(root.rows, "manual reading overrides.rows");
  const unresolved = new Set([...activeTexts].filter((text) => !resolved.has(text)));
  const overrideTexts = new Set<string>();
  const parsedRows: Array<{
    readonly text: string;
    readonly reading: string;
    readonly reason: string;
  }> = [];

  for (const [index, value] of rows.entries()) {
    const row = objectValue(value, `manual override row ${index}`);
    const text = normalizeText(stringValue(row.text, `manual override row ${index}.text`));
    if (overrideTexts.has(text)) {
      throw new CatalogReadingResolutionError(`duplicate manual reading override: ${text}`);
    }
    overrideTexts.add(text);
    parsedRows.push({
      text,
      reading: normalizeReading(stringValue(row.reading, `manual override row ${index}.reading`)),
      reason: stringValue(row.reason, `manual override row ${index}.reason`),
    });
  }

  if (!sameSet(overrideTexts, unresolved)) {
    throw new CatalogReadingResolutionError(
      `manual overrides must exactly match externally unresolved texts: expected ${sorted(unresolved).join(", ")}`,
    );
  }
  for (const row of parsedRows) {
    addEvidence(resolved, activeTexts, row.text, {
      resolvedReading: row.reading,
      sourceKind: "manual",
      sourceId: provenanceId,
      sourceVersion,
      evidenceId: `manual:${row.text}`,
      sourceReading: row.reading,
      confidence: "reviewed",
      reasons: [row.reason],
    });
  }
}

function createReport(
  activeRows: ReadonlyMap<string, CsvRecord>,
  resolved: ReadonlyMap<string, ResolutionEvidence>,
): ReadingResolutionReport {
  const rows = [...activeRows.entries()].map(([text, record]) => {
    const evidence = resolved.get(text);
    if (evidence === undefined) {
      throw new CatalogReadingResolutionError(`catalog text remains unresolved: ${text}`);
    }
    const originalReading = normalizeReading(record.values.reading ?? "");
    return {
      text,
      originalReading,
      resolvedReading: evidence.resolvedReading,
      sourceKind: evidence.sourceKind,
      sourceId: evidence.sourceId,
      sourceVersion: evidence.sourceVersion,
      evidenceId: evidence.evidenceId,
      sourceReading: evidence.sourceReading,
      confidence: evidence.confidence,
      changed: originalReading !== evidence.resolvedReading,
      reasons: evidence.reasons,
    } satisfies ReadingResolutionRow;
  }).sort((left, right) => left.text < right.text ? -1 : left.text > right.text ? 1 : 0);

  const counts: Record<ReadingSourceKind, number> = {
    "moe-concised": 0,
    "moe-revised": 0,
    cedict: 0,
    manual: 0,
  };
  for (const row of rows) {
    counts[row.sourceKind] += 1;
  }
  const changedTexts = rows.filter((row) => row.changed).map((row) => row.text);
  const digestPayload = {
    modelVersion: READING_RESOLUTION_MODEL_VERSION,
    candidateCount: rows.length,
    counts,
    rows,
  };
  return {
    modelVersion: READING_RESOLUTION_MODEL_VERSION,
    candidateCount: rows.length,
    counts,
    changedTexts,
    rows,
    determinismDigest: createHash("sha256")
      .update(JSON.stringify(digestPayload), "utf8")
      .digest("hex"),
  };
}

export function resolveCatalogReadings(
  input: CatalogReadingResolutionInput,
): CatalogReadingResolutionResult {
  const activeRows = activeCatalogRows(input.catalogRecords);
  const activeTexts = new Set(activeRows.keys());
  const resolved = new Map<string, ResolutionEvidence>();

  applyMoeConcised(input.moeConcisedProjection, resolved, activeTexts);
  applyMoeRevised(input.moeRevisedProjection, resolved, activeTexts);
  applyCedict(input.cedictProjection, resolved, activeTexts);
  applyManualOverrides(input.manualOverrides, resolved, activeTexts);

  if (resolved.size !== activeTexts.size) {
    throw new CatalogReadingResolutionError(
      `resolved ${resolved.size} readings for ${activeTexts.size} active catalog texts`,
    );
  }
  const report = createReport(activeRows, resolved);
  const records = input.catalogRecords.map((record) => {
    if ((record.values.status ?? "") === "excluded") {
      return record;
    }
    const text = normalizeText(record.values.text ?? "");
    const evidence = resolved.get(text);
    if (evidence === undefined) {
      throw new CatalogReadingResolutionError(`catalog row is unresolved: ${text}`);
    }
    const provenanceIds = [...new Set([
      ...splitProvenance(record.values.provenance_ids ?? ""),
      evidence.sourceId,
    ])];
    return {
      rowNumber: record.rowNumber,
      values: {
        ...record.values,
        reading: evidence.resolvedReading,
        provenance_ids: provenanceIds.join(";"),
      },
    };
  });
  return { records, report };
}

export function synchronizeRecordReadings(
  records: readonly CsvRecord[],
  report: ReadingResolutionReport,
): readonly CsvRecord[] {
  const readings = new Map(report.rows.map((row) => [row.text, row.resolvedReading]));
  return records.map((record) => {
    const text = normalizeText(record.values.text ?? "");
    const reading = readings.get(text);
    if (reading === undefined) {
      throw new CatalogReadingResolutionError(
        `sidecar row ${record.rowNumber} references unresolved catalog text: ${text}`,
      );
    }
    return {
      rowNumber: record.rowNumber,
      values: { ...record.values, reading },
    };
  });
}
