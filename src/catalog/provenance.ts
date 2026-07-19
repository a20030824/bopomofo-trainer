import type { CsvRecord } from "./csv.js";

const REQUIRED_FIELDS = ["id", "kind", "title", "license", "notes"] as const;

export type ProvenanceErrorCode =
  | "missing-provenance-field"
  | "duplicate-provenance-id";

export interface ProvenanceValidationError {
  readonly code: ProvenanceErrorCode;
  readonly message: string;
  readonly rowNumber: number;
  readonly field: string | null;
}

export interface ProvenanceRegistryResult {
  readonly ids: ReadonlySet<string>;
  readonly errors: readonly ProvenanceValidationError[];
}

export function createProvenanceRegistry(
  records: readonly CsvRecord[],
): ProvenanceRegistryResult {
  const ids = new Set<string>();
  const errors: ProvenanceValidationError[] = [];

  for (const record of records) {
    let rowValid = true;
    for (const field of REQUIRED_FIELDS) {
      if ((record.values[field] ?? "").length === 0) {
        rowValid = false;
        errors.push({
          code: "missing-provenance-field",
          message: `缺少 provenance 必要欄位「${field}」`,
          rowNumber: record.rowNumber,
          field,
        });
      }
    }

    const id = record.values.id ?? "";
    if (!rowValid || id.length === 0) {
      continue;
    }

    if (ids.has(id)) {
      errors.push({
        code: "duplicate-provenance-id",
        message: `重複的 provenance ID「${id}」`,
        rowNumber: record.rowNumber,
        field: "id",
      });
      continue;
    }

    ids.add(id);
  }

  return { ids, errors };
}
