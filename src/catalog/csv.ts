export interface CsvRecord {
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface CsvParseResult {
  readonly headers: readonly string[];
  readonly records: readonly CsvRecord[];
}

function parseRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === undefined) {
      continue;
    }

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unterminated quoted field");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }

  return rows.filter((values) => values.some((value) => value.trim().length > 0));
}

export function parseCsv(source: string): CsvParseResult {
  const rows = parseRows(source);
  const headerRow = rows[0];
  if (headerRow === undefined) {
    return { headers: [], records: [] };
  }

  const headers = headerRow.map((header) => header.trim());
  const records = rows.slice(1).map((values, index) => {
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      record[header] = values[column]?.trim() ?? "";
    });
    return { rowNumber: index + 2, values: record };
  });

  return { headers, records };
}
