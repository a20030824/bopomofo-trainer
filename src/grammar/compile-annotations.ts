import type { CatalogEntry } from "../core/model.js";
import type { CsvRecord } from "../catalog/csv.js";
import {
  GRAMMAR_ROLES,
  PREDICATE_FRAMES,
  STANDALONE_KINDS,
  type GrammarAnnotation,
  type GrammarAnnotationCompilationResult,
  type GrammarAnnotationError,
  type GrammarRole,
  type PredicateFrame,
  type StandaloneKind,
} from "./types.js";

const REQUIRED_FIELDS = [
  "text",
  "reading",
  "roles",
  "predicate_frame",
  "standalone_kind",
  "provenance_ids",
] as const;

function issue(
  code: GrammarAnnotationError["code"],
  message: string,
  rowNumber: number,
  text: string | null,
  field: string | null,
): GrammarAnnotationError {
  return { code, message, rowNumber, text, field };
}

function splitList(value: string): string[] {
  return [...new Set(
    value
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )];
}

function normalizeReading(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .join(" ");
}

function entryId(text: string, reading: string): string {
  return `word:${text}:${normalizeReading(reading).replace(/\s+/gu, "-")}`;
}

function predicateFrameConsistent(
  roles: readonly GrammarRole[],
  frame: PredicateFrame,
): boolean {
  switch (frame) {
    case "none":
      return !roles.some((role) => [
        "intransitive-predicate",
        "transitive-predicate",
        "modal",
        "verb",
        "adjectival-predicate",
      ].includes(role));
    case "intransitive":
      return roles.includes("intransitive-predicate") || roles.includes("verb");
    case "transitive":
      return roles.includes("transitive-predicate") || roles.includes("verb");
    case "modal":
      return roles.includes("modal");
    case "adjectival":
      return roles.includes("adjectival-predicate");
  }
}

export function compileGrammarAnnotations(
  records: readonly CsvRecord[],
  entries: readonly CatalogEntry[],
  knownProvenanceIds: ReadonlySet<string>,
): GrammarAnnotationCompilationResult {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const annotations: Record<string, GrammarAnnotation> = {};
  const errors: GrammarAnnotationError[] = [];

  for (const record of records) {
    const text = (record.values.text ?? "").normalize("NFC");
    for (const field of REQUIRED_FIELDS) {
      if ((record.values[field] ?? "").trim().length === 0) {
        errors.push(issue(
          "missing-field",
          `缺少必要欄位「${field}」`,
          record.rowNumber,
          text || null,
          field,
        ));
      }
    }

    const id = entryId(text, record.values.reading ?? "");
    if (!entriesById.has(id)) {
      errors.push(issue(
        "unknown-entry",
        `文法標註找不到詞庫項目「${id}」`,
        record.rowNumber,
        text || null,
        "reading",
      ));
    }
    if (annotations[id] !== undefined) {
      errors.push(issue(
        "duplicate-annotation",
        `詞庫項目「${id}」已有文法標註`,
        record.rowNumber,
        text || null,
        null,
      ));
    }

    const rawRoles = splitList(record.values.roles ?? "");
    const invalidRoles = rawRoles.filter((role) =>
      !GRAMMAR_ROLES.includes(role as GrammarRole)
    );
    for (const role of invalidRoles) {
      errors.push(issue(
        "invalid-role",
        `未知文法角色「${role}」`,
        record.rowNumber,
        text || null,
        "roles",
      ));
    }
    const roles = rawRoles.filter((role): role is GrammarRole =>
      GRAMMAR_ROLES.includes(role as GrammarRole)
    );

    const predicateFrame = record.values.predicate_frame as PredicateFrame;
    if (!PREDICATE_FRAMES.includes(predicateFrame)) {
      errors.push(issue(
        "invalid-predicate-frame",
        `未知述語框架「${record.values.predicate_frame ?? ""}」`,
        record.rowNumber,
        text || null,
        "predicate_frame",
      ));
    } else if (!predicateFrameConsistent(roles, predicateFrame)) {
      errors.push(issue(
        "inconsistent-predicate-frame",
        `述語框架「${predicateFrame}」與 roles 不一致`,
        record.rowNumber,
        text || null,
        "predicate_frame",
      ));
    }

    const standaloneKind = record.values.standalone_kind as StandaloneKind;
    if (!STANDALONE_KINDS.includes(standaloneKind)) {
      errors.push(issue(
        "invalid-standalone-kind",
        `未知單獨使用類型「${record.values.standalone_kind ?? ""}」`,
        record.rowNumber,
        text || null,
        "standalone_kind",
      ));
    }

    if (roles.includes("formulaic") && (
      roles.length !== 1 || standaloneKind !== "utterance"
    )) {
      errors.push(issue(
        "invalid-formulaic-role",
        "formulaic 必須單獨標註，且 standalone_kind 必須是 utterance",
        record.rowNumber,
        text || null,
        "roles",
      ));
    }

    const provenanceIds = splitList(record.values.provenance_ids ?? "");
    if (provenanceIds.length === 0) {
      errors.push(issue(
        "missing-provenance",
        "每筆文法標註至少需要一個 provenance ID",
        record.rowNumber,
        text || null,
        "provenance_ids",
      ));
    } else {
      for (const provenanceId of provenanceIds) {
        if (!knownProvenanceIds.has(provenanceId)) {
          errors.push(issue(
            "unknown-provenance",
            `找不到 provenance ID「${provenanceId}」`,
            record.rowNumber,
            text || null,
            "provenance_ids",
          ));
        }
      }
    }

    const rowHasError = errors.some((error) => error.rowNumber === record.rowNumber);
    if (!rowHasError && entriesById.has(id)) {
      annotations[id] = {
        entryId: id,
        roles,
        predicateFrame,
        standaloneKind,
        provenanceIds,
      };
    }
  }

  for (const entry of entries) {
    if (annotations[entry.id] === undefined) {
      errors.push(issue(
        "missing-annotation",
        `詞庫項目「${entry.prompt.text}」缺少文法標註`,
        0,
        entry.prompt.text,
        null,
      ));
    }
  }

  const ordered = Object.fromEntries(
    Object.entries(annotations).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
  return { annotations: ordered, errors };
}
