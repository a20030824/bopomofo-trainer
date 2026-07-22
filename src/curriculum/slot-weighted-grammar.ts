import type { CatalogEntry, RandomSource } from "../core/model.js";
import { DEFAULT_GRAMMAR_TEMPLATES } from "../grammar/templates.js";
import type {
  GrammarAnnotation,
  GrammarSlotAssignment,
  GrammarTemplate,
  GrammarTemplateSlot,
  GrammarUtteranceCandidate,
} from "../grammar/types.js";
import { weightedPick } from "./random.js";

export interface WeightedGrammarTemplateTrace {
  readonly templateId: string;
  readonly weight: number;
}

export interface WeightedGrammarEntryTrace {
  readonly entryId: string;
  readonly weight: number;
}

export interface GrammarSlotSelectionTrace {
  readonly slotKey: string;
  readonly role: GrammarTemplateSlot["role"];
  readonly selectedEntryId: string;
  readonly candidates: readonly WeightedGrammarEntryTrace[];
}

export interface SlotWeightedGrammarGeneration {
  readonly candidate: GrammarUtteranceCandidate | null;
  readonly templateCandidates: readonly WeightedGrammarTemplateTrace[];
  readonly slotSelections: readonly GrammarSlotSelectionTrace[];
  readonly fallbackReasons: readonly string[];
}

export interface SlotWeightedGrammarInput {
  readonly entries: readonly CatalogEntry[];
  readonly annotations: Readonly<Record<string, GrammarAnnotation>>;
  readonly random: RandomSource;
  readonly entryWeight: (entry: CatalogEntry) => number;
  readonly templateWeight: (template: GrammarTemplate) => number;
  readonly templates?: readonly GrammarTemplate[];
  readonly allowLexicalPromptFallback?: boolean;
}

interface IndexedSlot {
  readonly index: number;
  readonly slot: GrammarTemplateSlot;
}

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
  return {
    id: candidateId(kind, template?.id ?? null, entries.map((entry) => entry.id)),
    kind,
    templateId: template?.id ?? null,
    entries,
    assignments,
    text: entries.map((entry) => entry.prompt.text).join(" "),
    punctuation: template?.punctuation ?? null,
  };
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

function legalEntries(
  slot: GrammarTemplateSlot,
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  used: ReadonlySet<string>,
): readonly CatalogEntry[] {
  return entries.filter((entry) =>
    !used.has(entry.id) && entryMatchesSlot(entry, slot, annotations)
  );
}

function canAssignAll(
  slots: readonly IndexedSlot[],
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  used: ReadonlySet<string>,
): boolean {
  if (slots.length === 0) return true;
  const slotByIndex = new Map(slots.map((item) => [item.index, item]));
  const assignedSlotByEntry = new Map<string, number>();

  const assign = (slotIndex: number, visitedEntries: Set<string>): boolean => {
    const indexed = slotByIndex.get(slotIndex);
    if (indexed === undefined) return false;
    for (const entry of legalEntries(indexed.slot, entries, annotations, used)) {
      if (visitedEntries.has(entry.id)) continue;
      visitedEntries.add(entry.id);
      const previousSlot = assignedSlotByEntry.get(entry.id);
      if (previousSlot === undefined || assign(previousSlot, visitedEntries)) {
        assignedSlotByEntry.set(entry.id, slotIndex);
        return true;
      }
    }
    return false;
  };

  const ordered = [...slots].sort((left, right) =>
    legalEntries(left.slot, entries, annotations, used).length
      - legalEntries(right.slot, entries, annotations, used).length
    || left.index - right.index
  );
  return ordered.every((indexed) => assign(indexed.index, new Set<string>()));
}

function validateAnnotations(
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
): void {
  const missing = entries
    .filter((entry) => annotations[entry.id] === undefined)
    .map((entry) => entry.id)
    .sort(compareText);
  if (missing.length > 0) {
    throw new Error(`grammar annotations missing for: ${missing.join(", ")}`);
  }
}

function weightedEntryTraces(
  entries: readonly CatalogEntry[],
  weight: (entry: CatalogEntry) => number,
): readonly WeightedGrammarEntryTrace[] {
  return entries.map((entry) => ({ entryId: entry.id, weight: weight(entry) }));
}

function standaloneGeneration(
  input: SlotWeightedGrammarInput,
  kind: "utterance" | "lexical-prompt",
  fallbackReasons: readonly string[],
): SlotWeightedGrammarGeneration | null {
  const candidates = input.entries.filter((entry) =>
    input.annotations[entry.id]?.standaloneKind === kind
  );
  if (candidates.length === 0) return null;
  const traces = weightedEntryTraces(candidates, input.entryWeight);
  const selectedId = weightedPick(
    traces.map((item) => ({ value: item.entryId, weight: item.weight })),
    input.random,
  );
  const selected = candidates.find((entry) => entry.id === selectedId);
  if (selected === undefined) throw new Error("selected standalone entry disappeared");
  return {
    candidate: buildCandidate(
      kind === "utterance" ? "standalone-utterance" : "standalone-lexical-prompt",
      null,
      [selected],
      [],
    ),
    templateCandidates: [],
    slotSelections: [{
      slotKey: "standalone",
      role: input.annotations[selected.id]!.roles[0] ?? "formulaic",
      selectedEntryId: selected.id,
      candidates: traces,
    }],
    fallbackReasons,
  };
}

export function generateSlotWeightedGrammar(
  input: SlotWeightedGrammarInput,
): SlotWeightedGrammarGeneration {
  validateAnnotations(input.entries, input.annotations);
  const entries = [...input.entries].sort((left, right) => compareText(left.id, right.id));
  const templates = [...(input.templates ?? DEFAULT_GRAMMAR_TEMPLATES)]
    .sort((left, right) => compareText(left.id, right.id));
  const feasible = templates.filter((template) => canAssignAll(
    template.slots.map((slot, index) => ({ index, slot })),
    entries,
    input.annotations,
    new Set<string>(),
  ));

  if (feasible.length === 0) {
    return standaloneGeneration(input, "utterance", [
      "no-complete-template",
      "standalone-utterance",
    ]) ?? (input.allowLexicalPromptFallback ?? true
      ? standaloneGeneration(input, "lexical-prompt", [
          "no-complete-template",
          "no-standalone-utterance",
          "standalone-lexical-prompt",
        ])
      : null) ?? {
      candidate: null,
      templateCandidates: [],
      slotSelections: [],
      fallbackReasons: [
        "no-complete-template",
        "no-standalone-utterance",
        (input.allowLexicalPromptFallback ?? true)
          ? "no-standalone-lexical-prompt"
          : "lexical-prompt-fallback-disabled",
      ],
    };
  }

  const templateCandidates = feasible.map((template) => ({
    templateId: template.id,
    weight: input.templateWeight(template),
  }));
  const selectedTemplateId = weightedPick(
    templateCandidates.map((item) => ({ value: item.templateId, weight: item.weight })),
    input.random,
  );
  const template = feasible.find((item) => item.id === selectedTemplateId);
  if (template === undefined) throw new Error("selected grammar template disappeared");

  const remaining: IndexedSlot[] = template.slots.map((slot, index) => ({ index, slot }));
  const used = new Set<string>();
  const selectedBySlot = new Map<number, CatalogEntry>();
  const traceBySlot = new Map<number, GrammarSlotSelectionTrace>();

  while (remaining.length > 0) {
    remaining.sort((left, right) =>
      legalEntries(left.slot, entries, input.annotations, used).length
        - legalEntries(right.slot, entries, input.annotations, used).length
      || left.index - right.index
    );
    const current = remaining.shift();
    if (current === undefined) break;
    const safe = legalEntries(current.slot, entries, input.annotations, used).filter((entry) => {
      const nextUsed = new Set(used);
      nextUsed.add(entry.id);
      return canAssignAll(remaining, entries, input.annotations, nextUsed);
    });
    if (safe.length === 0) {
      throw new Error(`no completable entry for grammar slot: ${current.slot.key}`);
    }
    const candidates = weightedEntryTraces(safe, input.entryWeight);
    const selectedEntryId = weightedPick(
      candidates.map((item) => ({ value: item.entryId, weight: item.weight })),
      input.random,
    );
    const selected = safe.find((entry) => entry.id === selectedEntryId);
    if (selected === undefined) throw new Error("selected grammar entry disappeared");
    used.add(selected.id);
    selectedBySlot.set(current.index, selected);
    traceBySlot.set(current.index, {
      slotKey: current.slot.key,
      role: current.slot.role,
      selectedEntryId: selected.id,
      candidates,
    });
  }

  const selectedEntries = template.slots.map((_, index) => selectedBySlot.get(index));
  if (selectedEntries.some((entry) => entry === undefined)) {
    throw new Error("slot-weighted grammar generation produced an incomplete utterance");
  }
  const entriesInTemplateOrder = selectedEntries as CatalogEntry[];
  const assignments = template.slots.map((slot, index): GrammarSlotAssignment => ({
    slotKey: slot.key,
    role: slot.role,
    entryId: entriesInTemplateOrder[index]!.id,
  }));

  return {
    candidate: buildCandidate("template", template, entriesInTemplateOrder, assignments),
    templateCandidates,
    slotSelections: template.slots.map((_, index) => traceBySlot.get(index)!),
    fallbackReasons: [],
  };
}
