import type { CatalogEntry } from "../core/model.js";
import { DEFAULT_GRAMMAR_TEMPLATES } from "./templates.js";
import type {
  GrammarAnnotation,
  GrammarCompositionOptions,
  GrammarCompositionResult,
  GrammarRole,
  GrammarSlotAssignment,
  GrammarTemplate,
  GrammarTemplateSlot,
  GrammarUtteranceCandidate,
} from "./types.js";

const DEFAULT_OPTIONS: GrammarCompositionOptions = {
  maximumCandidates: 5_000,
  allowLexicalPromptFallback: true,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function candidateId(
  kind: GrammarUtteranceCandidate["kind"],
  templateId: string | null,
  entryIds: readonly string[],
): string {
  return `utterance:${kind}:${templateId ?? "none"}:${entryIds.join("|")}`;
}

function buildCandidate(
  kind: GrammarUtteranceCandidate["kind"],
  template: GrammarTemplate | null,
  entries: readonly CatalogEntry[],
  assignments: readonly GrammarSlotAssignment[],
): GrammarUtteranceCandidate {
  const entryIds = entries.map((entry) => entry.id);
  return {
    id: candidateId(kind, template?.id ?? null, entryIds),
    kind,
    templateId: template?.id ?? null,
    entries,
    assignments,
    text: entries.map((entry) => entry.prompt.text).join(" "),
    punctuation: template?.punctuation ?? null,
  };
}

function entriesByRole(
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
): ReadonlyMap<GrammarRole, readonly CatalogEntry[]> {
  const result = new Map<GrammarRole, CatalogEntry[]>();
  for (const entry of [...entries].sort((left, right) => compareText(left.id, right.id))) {
    const annotation = annotations[entry.id];
    if (annotation === undefined) continue;
    for (const role of annotation.roles) {
      const values = result.get(role) ?? [];
      values.push(entry);
      result.set(role, values);
    }
  }
  return result;
}

function entryMatchesSlot(
  entry: CatalogEntry,
  slot: GrammarTemplateSlot,
  annotations: Readonly<Record<string, GrammarAnnotation>>,
): boolean {
  const annotation = annotations[entry.id];
  if (annotation === undefined || !annotation.roles.includes(slot.role)) return false;
  return slot.predicateFrames === undefined
    || slot.predicateFrames.includes(annotation.predicateFrame);
}

function enumerateTemplate(
  template: GrammarTemplate,
  roleIndex: ReadonlyMap<GrammarRole, readonly CatalogEntry[]>,
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  maximum: number,
): readonly GrammarUtteranceCandidate[] {
  const candidates: GrammarUtteranceCandidate[] = [];
  const selected: CatalogEntry[] = [];
  const assignments: GrammarSlotAssignment[] = [];
  const used = new Set<string>();

  const visit = (slotIndex: number): void => {
    if (candidates.length >= maximum) return;
    const slot = template.slots[slotIndex];
    if (slot === undefined) {
      candidates.push(buildCandidate("template", template, [...selected], [...assignments]));
      return;
    }
    for (const entry of roleIndex.get(slot.role) ?? []) {
      if (used.has(entry.id) || !entryMatchesSlot(entry, slot, annotations)) continue;
      used.add(entry.id);
      selected.push(entry);
      assignments.push({ slotKey: slot.key, role: slot.role, entryId: entry.id });
      visit(slotIndex + 1);
      assignments.pop();
      selected.pop();
      used.delete(entry.id);
      if (candidates.length >= maximum) return;
    }
  };

  visit(0);
  return candidates;
}

function standaloneCandidates(
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  kind: "utterance" | "lexical-prompt",
): readonly GrammarUtteranceCandidate[] {
  return [...entries]
    .filter((entry) => annotations[entry.id]?.standaloneKind === kind)
    .sort((left, right) => compareText(left.id, right.id))
    .map((entry) => buildCandidate(
      kind === "utterance" ? "standalone-utterance" : "standalone-lexical-prompt",
      null,
      [entry],
      [],
    ));
}

export function composeGrammarCandidates(
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  templates: readonly GrammarTemplate[] = DEFAULT_GRAMMAR_TEMPLATES,
  options: Partial<GrammarCompositionOptions> = {},
): GrammarCompositionResult {
  const resolved: GrammarCompositionOptions = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isInteger(resolved.maximumCandidates) || resolved.maximumCandidates <= 0) {
    throw new RangeError("maximumCandidates must be a positive integer");
  }

  const missing = entries
    .filter((entry) => annotations[entry.id] === undefined)
    .map((entry) => entry.id)
    .sort(compareText);
  if (missing.length > 0) {
    throw new Error(`grammar annotations missing for: ${missing.join(", ")}`);
  }

  const roleIndex = entriesByRole(entries, annotations);
  const orderedTemplates = [...templates].sort((left, right) => compareText(left.id, right.id));
  const candidates: GrammarUtteranceCandidate[] = [];
  for (const template of orderedTemplates) {
    const remaining = resolved.maximumCandidates - candidates.length;
    if (remaining <= 0) break;
    candidates.push(...enumerateTemplate(template, roleIndex, annotations, remaining));
  }

  const canonical = candidates.sort((left, right) =>
    compareText(left.templateId ?? "", right.templateId ?? "")
    || compareText(left.entries.map((entry) => entry.id).join("\u0000"), right.entries.map((entry) => entry.id).join("\u0000"))
  );
  if (canonical.length > 0) {
    return { candidates: canonical, fallbackReasons: [] };
  }

  const utterances = standaloneCandidates(entries, annotations, "utterance");
  if (utterances.length > 0) {
    return {
      candidates: utterances.slice(0, resolved.maximumCandidates),
      fallbackReasons: ["no-complete-template", "standalone-utterance"],
    };
  }

  if (resolved.allowLexicalPromptFallback) {
    const lexical = standaloneCandidates(entries, annotations, "lexical-prompt");
    if (lexical.length > 0) {
      return {
        candidates: lexical.slice(0, resolved.maximumCandidates),
        fallbackReasons: ["no-complete-template", "no-standalone-utterance", "standalone-lexical-prompt"],
      };
    }
  }

  return {
    candidates: [],
    fallbackReasons: [
      "no-complete-template",
      "no-standalone-utterance",
      resolved.allowLexicalPromptFallback
        ? "no-standalone-lexical-prompt"
        : "lexical-prompt-fallback-disabled",
    ],
  };
}
