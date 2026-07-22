import type { CatalogEntry } from "../core/model.js";
import { COMMONNESS_MODEL_V1, projectCommonness } from "./project.js";
import type {
  CommonnessEvidence,
  CommonnessModelConfig,
  CommonnessProjection,
} from "./types.js";

export const NAER_GENERAL_FREQUENCY_ADAPTER_VERSION =
  "naer-general-frequency-adapter-v1";
export const NAER_GENERAL_FREQUENCY_SOURCE_ID =
  "naer:coct-general-frequency";
export const NAER_GENERAL_FREQUENCY_SOURCE_VERSION = "1141208";
export const NAER_GENERAL_FREQUENCY_SHEET = "通用詞頻表";
export const NAER_GENERAL_FREQUENCY_DIMENSION = "A1:L163702";
export const NAER_GENERAL_FREQUENCY_SHA256 =
  "bfd3b73938e115ae39a44c5e11c97135c09939cf598157cb2fe0b33c4302de75";
export const NAER_GENERAL_FREQUENCY_HEADERS = [
  "綜合\n序位",
  "詞",
  "書面語\n詞頻",
  "書面語\n每百萬詞頻",
  "書面語\n序位",
  "口語\n詞頻",
  "口語\n每百萬詞頻",
  "口語\n序位",
  "新聞\n詞頻",
  "新聞\n每百萬詞頻",
  "新聞\n序位",
  "每百萬詞頻\n(平均)",
] as const;

export interface NaerWorkbookIdentity {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly checksumSha256: string;
  readonly sheetName: string;
  readonly dimension: string;
  readonly headers: readonly string[];
}

export interface NaerGeneralFrequencyRow {
  readonly generalRank: number;
  readonly lexicalText: string;
  readonly writtenPerMillion: number | null;
  readonly spokenPerMillion: number | null;
}

export interface NaerActiveCatalogRowsFile {
  readonly adapterVersion: string;
  readonly source: NaerWorkbookIdentity;
  readonly rows: readonly NaerGeneralFrequencyRow[];
}

export type NaerIdentityExclusionCode = "unmatched_text";

export interface NaerIdentityExclusion {
  readonly sourceRowId: string;
  readonly lexicalText: string;
  readonly code: NaerIdentityExclusionCode;
  readonly catalogEntryIds: readonly string[];
}

export interface NaerEvidenceMapping {
  readonly evidence: readonly CommonnessEvidence[];
  readonly exclusions: readonly NaerIdentityExclusion[];
  readonly unmatchedCatalogEntryIds: readonly string[];
}

export interface NaerCommonnessProjectionResult extends NaerEvidenceMapping {
  readonly projection: CommonnessProjection;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeNaerLexicalText(value: string): string {
  return value.trim().normalize("NFC");
}

export function validateNaerWorkbookIdentity(
  identity: NaerWorkbookIdentity,
): void {
  if (identity.sourceId !== NAER_GENERAL_FREQUENCY_SOURCE_ID) {
    throw new Error("NAER workbook source ID mismatch");
  }
  if (identity.sourceVersion !== NAER_GENERAL_FREQUENCY_SOURCE_VERSION) {
    throw new Error("NAER workbook source version mismatch");
  }
  if (identity.checksumSha256 !== NAER_GENERAL_FREQUENCY_SHA256) {
    throw new Error("NAER workbook checksum mismatch");
  }
  if (identity.sheetName !== NAER_GENERAL_FREQUENCY_SHEET) {
    throw new Error("NAER workbook sheet mismatch");
  }
  if (identity.dimension !== NAER_GENERAL_FREQUENCY_DIMENSION) {
    throw new Error("NAER workbook dimension mismatch");
  }
  if (
    identity.headers.length !== NAER_GENERAL_FREQUENCY_HEADERS.length
    || identity.headers.some(
      (header, index) => header !== NAER_GENERAL_FREQUENCY_HEADERS[index],
    )
  ) {
    throw new Error("NAER workbook headers mismatch");
  }
}

function validateFrequency(value: number | null, label: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new RangeError(
      `${label} must be null or a finite non-negative number`,
    );
  }
}

function validateRows(rows: readonly NaerGeneralFrequencyRow[]): void {
  const ranks = new Set<number>();
  const texts = new Set<string>();
  for (const row of rows) {
    if (!Number.isInteger(row.generalRank) || row.generalRank <= 0) {
      throw new RangeError("NAER general rank must be a positive integer");
    }
    const lexicalText = normalizeNaerLexicalText(row.lexicalText);
    if (lexicalText.length === 0) {
      throw new TypeError("NAER lexical text must not be empty");
    }
    if (ranks.has(row.generalRank)) {
      throw new Error(`duplicate NAER general rank: ${row.generalRank}`);
    }
    if (texts.has(lexicalText)) {
      throw new Error(`duplicate NAER lexical text: ${lexicalText}`);
    }
    ranks.add(row.generalRank);
    texts.add(lexicalText);
    validateFrequency(row.writtenPerMillion, "writtenPerMillion");
    validateFrequency(row.spokenPerMillion, "spokenPerMillion");
  }
}

export function mapNaerRowsToCatalogEvidence(
  rows: readonly NaerGeneralFrequencyRow[],
  catalog: readonly CatalogEntry[],
): NaerEvidenceMapping {
  validateRows(rows);

  const catalogByText = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const key = normalizeNaerLexicalText(entry.prompt.text);
    const values = catalogByText.get(key) ?? [];
    values.push(entry);
    catalogByText.set(key, values);
  }
  for (const values of catalogByText.values()) {
    values.sort((left, right) => compareText(left.id, right.id));
  }

  const evidence: CommonnessEvidence[] = [];
  const exclusions: NaerIdentityExclusion[] = [];
  const sourceTexts = new Set<string>();
  const sortedRows = [...rows].sort(
    (left, right) => left.generalRank - right.generalRank
      || compareText(
        normalizeNaerLexicalText(left.lexicalText),
        normalizeNaerLexicalText(right.lexicalText),
      ),
  );

  for (const row of sortedRows) {
    const lexicalText = normalizeNaerLexicalText(row.lexicalText);
    const sourceRowId = `${NAER_GENERAL_FREQUENCY_SOURCE_VERSION}:${row.generalRank}`;
    const matches = catalogByText.get(lexicalText) ?? [];
    sourceTexts.add(lexicalText);

    if (matches.length === 0) {
      exclusions.push({
        sourceRowId,
        lexicalText,
        code: "unmatched_text",
        catalogEntryIds: [],
      });
      continue;
    }

    // Multiple matches happen when the same hanzi has more than one active
    // reading (a real heteronym): the NAER frequency figure describes the
    // written/spoken word regardless of which reading is practiced, so the
    // same evidence applies to every reading variant rather than being
    // treated as an identity conflict.
    for (const match of matches) {
      evidence.push({
        catalogEntryId: match.id,
        catalogText: match.prompt.text,
        sourceId: NAER_GENERAL_FREQUENCY_SOURCE_ID,
        sourceVersion: NAER_GENERAL_FREQUENCY_SOURCE_VERSION,
        sourceRowId,
        writtenPerMillion: row.writtenPerMillion,
        spokenPerMillion: row.spokenPerMillion,
        identityStatus: "reviewed",
      });
    }
  }

  const unmatchedCatalogEntryIds = catalog
    .filter((entry) => !sourceTexts.has(
      normalizeNaerLexicalText(entry.prompt.text),
    ))
    .map((entry) => entry.id)
    .sort(compareText);

  return {
    evidence: evidence.sort(
      (left, right) => compareText(left.catalogEntryId, right.catalogEntryId),
    ),
    exclusions: exclusions.sort(
      (left, right) => compareText(left.sourceRowId, right.sourceRowId)
        || compareText(left.code, right.code),
    ),
    unmatchedCatalogEntryIds,
  };
}

export function projectNaerCommonness(
  identity: NaerWorkbookIdentity,
  rows: readonly NaerGeneralFrequencyRow[],
  catalog: readonly CatalogEntry[],
  config: CommonnessModelConfig = COMMONNESS_MODEL_V1,
): NaerCommonnessProjectionResult {
  validateNaerWorkbookIdentity(identity);
  const mapped = mapNaerRowsToCatalogEvidence(rows, catalog);
  return {
    ...mapped,
    projection: projectCommonness(mapped.evidence, config),
  };
}

export function projectNaerActiveCatalogRows(
  source: NaerActiveCatalogRowsFile,
  catalog: readonly CatalogEntry[],
  config: CommonnessModelConfig = COMMONNESS_MODEL_V1,
): NaerCommonnessProjectionResult {
  if (source.adapterVersion !== NAER_GENERAL_FREQUENCY_ADAPTER_VERSION) {
    throw new Error("NAER adapter version mismatch");
  }
  return projectNaerCommonness(source.source, source.rows, catalog, config);
}
