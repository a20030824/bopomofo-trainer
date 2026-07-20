import type {
  ReferenceAdapterRowError,
  ReferenceTabularRecord,
  ReferenceTabularValue,
} from "./types.js";

export type ParsedTabularRecord =
  | { readonly ok: true; readonly inputIndex: number; readonly record: ReferenceTabularRecord }
  | { readonly ok: false; readonly error: ReferenceAdapterRowError };

function recoverSourceRowId(value: unknown): string | null {
  if (typeof value !== "string"
    && typeof value !== "number"
    && typeof value !== "boolean") {
    return null;
  }
  const normalized = String(value).normalize("NFC").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseCsvCells(input: string, delimiter: string): readonly (readonly string[])[] {
  if ([...delimiter].length !== 1) {
    throw new TypeError("csv delimiter must contain exactly one character");
  }
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }
    if (character === delimiter) {
      record.push(field);
      field = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }
    field += character;
  }

  if (inQuotes) throw new TypeError("csv input ends inside a quoted field");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function csvRecords(
  input: string,
  delimiter: string,
  sourceRowIdColumn: string,
): readonly ParsedTabularRecord[] {
  const records = parseCsvCells(input, delimiter);
  const headerRow = records[0];
  if (headerRow === undefined) throw new TypeError("csv input must contain a header row");
  const headers = headerRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/u, "") : header).trim()
  );
  if (headers.some((header) => header.length === 0)) {
    throw new TypeError("csv header names must not be empty");
  }
  if (new Set(headers).size !== headers.length) {
    throw new TypeError("csv header names must be unique");
  }
  const sourceRowIdIndex = headers.indexOf(sourceRowIdColumn);

  return records.slice(1).map((values, rowOffset): ParsedTabularRecord => {
    const inputIndex = rowOffset;
    if (values.length !== headers.length) {
      return {
        ok: false,
        error: {
          inputIndex,
          sourceRowId: sourceRowIdIndex < 0
            ? null
            : recoverSourceRowId(values[sourceRowIdIndex]),
          code: "malformed_tabular_row",
          message: "csv row has a different field count from the header",
          details: {
            expectedFieldCount: headers.length,
            actualFieldCount: values.length,
          },
        },
      };
    }
    const record: Record<string, ReferenceTabularValue> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return { ok: true, inputIndex, record };
  });
}

function validJsonValue(value: unknown): value is ReferenceTabularValue {
  return value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function jsonRecords(
  input: string,
  sourceRowIdColumn: string,
): readonly ParsedTabularRecord[] {
  const parsed: unknown = JSON.parse(input);
  if (!Array.isArray(parsed)) throw new TypeError("json tabular input must be an array");
  return parsed.map((value, inputIndex): ParsedTabularRecord => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        ok: false,
        error: {
          inputIndex,
          sourceRowId: null,
          code: "malformed_tabular_row",
          message: "json row must be an object",
          details: { valueType: Array.isArray(value) ? "array" : typeof value },
        },
      };
    }
    const source = value as Readonly<Record<string, unknown>>;
    const sourceRowId = recoverSourceRowId(source[sourceRowIdColumn]);
    const invalidKey = Object.keys(source).sort().find((key) => !validJsonValue(source[key]));
    if (invalidKey !== undefined) {
      return {
        ok: false,
        error: {
          inputIndex,
          sourceRowId,
          code: "malformed_tabular_row",
          message: "json row contains an unsupported nested value",
          details: { column: invalidKey },
        },
      };
    }
    return { ok: true, inputIndex, record: source as ReferenceTabularRecord };
  });
}

export function parseTabularRecords(
  input: string,
  format: "csv" | "json",
  csvDelimiter: string,
  sourceRowIdColumn: string,
): readonly ParsedTabularRecord[] {
  return format === "csv"
    ? csvRecords(input, csvDelimiter, sourceRowIdColumn)
    : jsonRecords(input, sourceRowIdColumn);
}
