import type {
  ReadingToneNotation,
  ReferenceTabularFormat,
  TabularColumnMap,
  TabularReferenceAdapterConfig,
} from "./types.js";

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}
function nullableText(value: unknown, label: string): string | null {
  return value === undefined || value === null ? null : text(value, label);
}
function format(value: unknown): ReferenceTabularFormat {
  const parsed = text(value, "format");
  if (parsed !== "csv" && parsed !== "json") throw new TypeError("format must be csv or json");
  return parsed;
}
function notation(value: unknown): ReadingToneNotation {
  const parsed = text(value, "toneNotation");
  if (parsed !== "diacritic" && parsed !== "explicit-digits" && parsed !== "mixed") {
    throw new TypeError("toneNotation is invalid");
  }
  return parsed;
}
function columns(value: unknown): TabularColumnMap {
  const source = object(value, "columns");
  return {
    sourceRowId: text(source.sourceRowId, "columns.sourceRowId"),
    text: text(source.text, "columns.text"),
    reading: text(source.reading, "columns.reading"),
    oralPerMillion: nullableText(source.oralPerMillion, "columns.oralPerMillion"),
    writtenPerMillion: nullableText(source.writtenPerMillion, "columns.writtenPerMillion"),
    level: nullableText(source.level, "columns.level"),
    levelOrdinal: nullableText(source.levelOrdinal, "columns.levelOrdinal"),
    domains: nullableText(source.domains, "columns.domains"),
    sourceRecordUrl: nullableText(source.sourceRecordUrl, "columns.sourceRecordUrl"),
  };
}
export function parseTabularReferenceAdapterConfig(
  value: unknown,
): TabularReferenceAdapterConfig {
  const source = object(value, "adapter config");
  const csvDelimiter = source.csvDelimiter === undefined ? "," : text(source.csvDelimiter, "csvDelimiter");
  if ([...csvDelimiter].length !== 1) throw new TypeError("csvDelimiter must be one character");
  return {
    adapterId: text(source.adapterId, "adapterId"),
    adapterVersion: text(source.adapterVersion, "adapterVersion"),
    sourceId: text(source.sourceId, "sourceId"),
    sourceVersion: text(source.sourceVersion, "sourceVersion"),
    format: format(source.format),
    toneNotation: notation(source.toneNotation),
    columns: columns(source.columns),
    csvDelimiter,
    domainSeparator: source.domainSeparator === undefined ? "|" : text(source.domainSeparator, "domainSeparator"),
    sourceRecordUrlTemplate: nullableText(source.sourceRecordUrlTemplate, "sourceRecordUrlTemplate"),
  };
}
