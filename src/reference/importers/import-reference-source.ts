import { compileReferenceRow } from "../compile-reference.js";
import type { ReferenceSourceManifest, ReferenceSourceRow } from "../types.js";
import { buildReferenceImportSummary } from "./import-summary.js";
import { normalizeReferenceReading } from "./reading-normalizer.js";
import {
  importReason,
  mapCompilationCode,
  normalizeSourceRowIdentity,
  parseDomains,
  parseLevelOrdinal,
  parseNullableFrequency,
  parseNullableLevel,
  parseNullableSourceRecordUrl,
} from "./row-normalizers.js";
import type {
  ImportedReferenceRow,
  ReferenceAdapterRow,
  ReferenceImportError,
  ReferenceImportErrorCode,
  ReferenceImportReason,
  ReferenceImportResult,
  ReferenceImportStage,
  ReferenceSourceAdapter,
} from "./types.js";

function importError(
  adapter: ReferenceSourceAdapter,
  inputIndex: number,
  sourceRowId: string | null,
  rawReading: ReferenceAdapterRow["rawReading"] | null,
  normalizedReading: string | null,
  adapterRow: ReferenceAdapterRow | null,
  code: ReferenceImportErrorCode,
  stage: ReferenceImportStage,
  message: string,
  reasons: readonly ReferenceImportReason[],
): ReferenceImportError {
  return {
    sourceId: adapter.sourceId,
    sourceVersion: adapter.sourceVersion,
    adapterId: adapter.adapterId,
    adapterVersion: adapter.adapterVersion,
    inputIndex,
    sourceRowId,
    rawReading,
    normalizedReading,
    adapterRow,
    code,
    stage,
    message,
    reasons,
  };
}

export function importReferenceSource(
  input: string,
  adapter: ReferenceSourceAdapter,
  manifest: ReferenceSourceManifest,
): ReferenceImportResult {
  if (adapter.sourceId !== manifest.id) {
    throw new TypeError(`adapter source ${adapter.sourceId} does not match manifest ${manifest.id}`);
  }
  if (adapter.sourceVersion !== manifest.version) {
    throw new TypeError(
      `adapter source version ${adapter.sourceVersion} does not match manifest ${manifest.version}`,
    );
  }

  const parsedRows = adapter.parse(input);
  const identityCounts = new Map<string, number>();
  for (const parsed of parsedRows) {
    if (!parsed.ok) continue;
    const identity = normalizeSourceRowIdentity(parsed.row.sourceRowId);
    if (identity.length === 0) continue;
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  }

  const accepted: ImportedReferenceRow[] = [];
  const errors: ReferenceImportError[] = [];
  const sourceRegistry: Readonly<Record<string, ReferenceSourceManifest>> = {
    [manifest.id]: manifest,
  };

  for (const parsed of parsedRows) {
    if (!parsed.ok) {
      errors.push(importError(
        adapter,
        parsed.error.inputIndex,
        parsed.error.sourceRowId,
        null,
        null,
        null,
        parsed.error.code,
        "tabular-parse",
        parsed.error.message,
        [importReason(parsed.error.code, null, parsed.error.details)],
      ));
      continue;
    }

    const adapterRow = parsed.row;
    const sourceRowId = normalizeSourceRowIdentity(adapterRow.sourceRowId);
    if (sourceRowId.length === 0) {
      errors.push(importError(
        adapter,
        adapterRow.inputIndex,
        null,
        adapterRow.rawReading,
        null,
        adapterRow,
        "invalid_source_row_identity",
        "adapter-map",
        "source row identity must not be empty",
        [importReason("empty_source_row_identity", "sourceRowId", {})],
      ));
      continue;
    }

    const occurrenceCount = identityCounts.get(sourceRowId) ?? 0;
    if (occurrenceCount > 1) {
      errors.push(importError(
        adapter,
        adapterRow.inputIndex,
        sourceRowId,
        adapterRow.rawReading,
        null,
        adapterRow,
        "duplicate_source_row_identity",
        "deduplicate",
        "all rows sharing a duplicate source identity are rejected",
        [importReason("duplicate_identity_all_occurrences_rejected", "sourceRowId", {
          sourceRowId,
          occurrenceCount,
        })],
      ));
      continue;
    }

    const reading = normalizeReferenceReading(adapterRow.rawReading, adapter.toneNotation);
    if (!reading.ok) {
      errors.push(importError(
        adapter,
        adapterRow.inputIndex,
        sourceRowId,
        reading.rawReading,
        reading.normalizedReading,
        adapterRow,
        reading.code,
        "reading-normalize",
        reading.message,
        reading.reasons,
      ));
      continue;
    }

    const oral = parseNullableFrequency(adapterRow.oralPerMillion, "oralPerMillion");
    const written = parseNullableFrequency(adapterRow.writtenPerMillion, "writtenPerMillion");
    if (!oral.ok || !written.ok) {
      const invalid = [oral, written].filter(
        (item): item is Extract<typeof oral, { readonly ok: false }> => !item.ok,
      );
      errors.push(importError(
        adapter,
        adapterRow.inputIndex,
        sourceRowId,
        reading.rawReading,
        reading.normalizedReading,
        adapterRow,
        "invalid_frequency",
        "row-normalize",
        invalid.map((item) => item.message).join("; "),
        invalid.map((item) => item.reason),
      ));
      continue;
    }

    const level = parseNullableLevel(adapterRow.level);
    if (!level.ok) {
      errors.push(importError(
        adapter, adapterRow.inputIndex, sourceRowId, reading.rawReading,
        reading.normalizedReading, adapterRow, "invalid_level", "row-normalize",
        level.message, [level.reason],
      ));
      continue;
    }
    const sourceRecordUrl = parseNullableSourceRecordUrl(adapterRow.sourceRecordUrl);
    if (!sourceRecordUrl.ok) {
      errors.push(importError(
        adapter, adapterRow.inputIndex, sourceRowId, reading.rawReading,
        reading.normalizedReading, adapterRow, "invalid_source_record_url", "row-normalize",
        sourceRecordUrl.message, [sourceRecordUrl.reason],
      ));
      continue;
    }
    const levelOrdinal = parseLevelOrdinal(adapterRow.levelOrdinal);
    if (!levelOrdinal.ok) {
      errors.push(importError(
        adapter, adapterRow.inputIndex, sourceRowId, reading.rawReading,
        reading.normalizedReading, adapterRow, "invalid_level", "row-normalize",
        levelOrdinal.message, [levelOrdinal.reason],
      ));
      continue;
    }

    const domains = parseDomains(adapterRow.domains, adapter.domainSeparator);
    const row: ReferenceSourceRow = {
      sourceId: adapter.sourceId,
      sourceRowId,
      text: adapterRow.text.normalize("NFC").trim(),
      reading: reading.normalizedReading,
      oralPerMillion: oral.value,
      writtenPerMillion: written.value,
      level: level.value,
      levelOrdinal: levelOrdinal.value,
      domains: domains.value,
      sourceRecordUrl: sourceRecordUrl.value,
    };
    const compiled = compileReferenceRow(row, sourceRegistry);
    if (!compiled.ok) {
      errors.push(importError(
        adapter,
        adapterRow.inputIndex,
        sourceRowId,
        reading.rawReading,
        reading.normalizedReading,
        adapterRow,
        mapCompilationCode(compiled.error.code),
        "candidate-compile",
        compiled.error.message,
        [importReason("shared_candidate_compiler_rejected", null, {
          compilationCode: compiled.error.code,
        })],
      ));
      continue;
    }

    accepted.push({
      sourceVersion: adapter.sourceVersion,
      adapterId: adapter.adapterId,
      adapterVersion: adapter.adapterVersion,
      inputIndex: adapterRow.inputIndex,
      rawReading: reading.rawReading,
      normalizedReading: reading.normalizedReading,
      adapterRow,
      row,
      candidate: compiled.candidate,
      reasons: [
        ...reading.reasons,
        oral.reason,
        written.reason,
        level.reason,
        sourceRecordUrl.reason,
        domains.reason,
        importReason("candidate_compiled", null, { candidateId: compiled.candidate.id }),
      ],
    });
  }

  return {
    manifest,
    accepted,
    errors,
    summary: buildReferenceImportSummary(
      manifest,
      adapter,
      parsedRows.length,
      accepted,
      errors,
    ),
  };
}
