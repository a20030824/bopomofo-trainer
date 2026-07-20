import { parseTabularRecords } from "./tabular-parser.js";
import type {
  ReferenceAdapterRow,
  ReferenceAdapterRowResult,
  ReferenceRawReading,
  ReferenceSourceAdapter,
  ReferenceTabularRecord,
  ReferenceTabularValue,
  TabularColumnMap,
  TabularReferenceAdapterConfig,
} from "./types.js";

function requiredText(
  record: ReferenceTabularRecord,
  column: string,
): string | null {
  const value = record[column];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).normalize("NFC").trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function readingValue(
  record: ReferenceTabularRecord,
  column: string,
): ReferenceRawReading | null {
  const value = record[column];
  if (Array.isArray(value)) return [...value];
  if (typeof value === "string") return value.trim().length > 0 ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function optionalValue(
  record: ReferenceTabularRecord,
  column: string | null,
): ReferenceTabularValue {
  if (column === null) return null;
  return record[column] ?? null;
}

function fillRecordUrl(
  record: ReferenceTabularRecord,
  columns: TabularColumnMap,
  sourceRowId: string,
  template: string | null,
): ReferenceTabularValue {
  const direct = optionalValue(record, columns.sourceRecordUrl);
  if (direct !== null && !(typeof direct === "string" && direct.trim().length === 0)) {
    return direct;
  }
  return template === null
    ? null
    : template.replaceAll("{sourceRowId}", encodeURIComponent(sourceRowId));
}

function mapRow(
  record: ReferenceTabularRecord,
  inputIndex: number,
  config: TabularReferenceAdapterConfig,
): ReferenceAdapterRowResult {
  const sourceRowId = requiredText(record, config.columns.sourceRowId);
  const text = requiredText(record, config.columns.text);
  const rawReading = readingValue(record, config.columns.reading);
  const missing = [
    sourceRowId === null ? config.columns.sourceRowId : null,
    text === null ? config.columns.text : null,
    rawReading === null ? config.columns.reading : null,
  ].filter((value): value is string => value !== null).sort();

  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        inputIndex,
        sourceRowId,
        code: "missing_required_column",
        message: "tabular row is missing a required importer value",
        details: { columns: missing.join(",") },
      },
    };
  }

  const row: ReferenceAdapterRow = {
    inputIndex,
    sourceRowId: sourceRowId!,
    text: text!,
    rawReading: rawReading!,
    oralPerMillion: optionalValue(record, config.columns.oralPerMillion),
    writtenPerMillion: optionalValue(record, config.columns.writtenPerMillion),
    level: optionalValue(record, config.columns.level),
    levelOrdinal: optionalValue(record, config.columns.levelOrdinal),
    domains: optionalValue(record, config.columns.domains),
    sourceRecordUrl: fillRecordUrl(
      record,
      config.columns,
      sourceRowId!,
      config.sourceRecordUrlTemplate,
    ),
  };
  return { ok: true, row };
}

export function createTabularReferenceSourceAdapter(
  config: TabularReferenceAdapterConfig,
): ReferenceSourceAdapter {
  if (config.adapterId.trim().length === 0 || config.adapterVersion.trim().length === 0) {
    throw new TypeError("adapter id and version must not be empty");
  }
  if (config.sourceId.trim().length === 0 || config.sourceVersion.trim().length === 0) {
    throw new TypeError("source id and version must not be empty");
  }
  return {
    adapterId: config.adapterId,
    adapterVersion: config.adapterVersion,
    sourceId: config.sourceId,
    sourceVersion: config.sourceVersion,
    toneNotation: config.toneNotation,
    domainSeparator: config.domainSeparator,
    parse(input: string): readonly ReferenceAdapterRowResult[] {
      return parseTabularRecords(input, config.format, config.csvDelimiter).map((parsed) =>
        parsed.ok ? mapRow(parsed.record, parsed.inputIndex, config) : parsed
      );
    },
  };
}
