import { describe, expect, it } from "vitest";
import type { CatalogEntry, RandomSource } from "../../src/core/model.js";
import {
  FREQUENCY_FIRST_UTTERANCE_POLICY,
  selectFrequencyFirstUtterance,
} from "../../src/curriculum/frequency-first-utterance.js";
import { generateSlotWeightedGrammar } from "../../src/curriculum/slot-weighted-grammar.js";
import type {
  GrammarAnnotation,
  GrammarRole,
  PredicateFrame,
} from "../../src/grammar/types.js";
import type { MeasurementSummary } from "../../src/measurement/types.js";

const measurement: MeasurementSummary = {
  policyVersion: "fixture",
  traceCount: 0,
  bindingObservationCount: 0,
  confusionObservationCount: 0,
  transitionObservationCount: 0,
  bindings: {},
  confusions: {},
  transitions: {},
};

function constantRandom(value: number): RandomSource {
  return { next: () => value };
}

function entry(id: string): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [{ tokens: [`zhuyin:${id}`] }],
    frequencyBand: 1,
    commonnessBase: {
      modelVersion: "commonness-v1",
      sourceId: "fixture",
      sourceVersion: "1",
      sourceRowId: id,
      spokenPerMillion: 1,
      writtenPerMillion: 1,
      spokenStrength: 1,
      writtenStrength: 1,
      score: 1,
      selectionWeight: 1,
      confidence: "reviewed",
      reasons: ["fixture"],
    },
    tags: ["fixture"],
    provenanceIds: ["fixture"],
  };
}

function annotation(
  id: string,
  roles: readonly GrammarRole[],
  predicateFrame: PredicateFrame,
): GrammarAnnotation {
  return {
    entryId: id,
    roles,
    predicateFrame,
    standaloneKind: "none",
    provenanceIds: ["fixture"],
  };
}

function select(
  entries: readonly CatalogEntry[],
  annotations: Readonly<Record<string, GrammarAnnotation>>,
  random: RandomSource,
) {
  return selectFrequencyFirstUtterance({
    entries,
    annotations,
    measurement,
    mode: "guided",
    layoutId: "standard",
    stage: 1,
    history: {
      recentEntryIds: [],
      recentUtteranceIds: [],
      recentTemplateIds: [],
    },
    policy: FREQUENCY_FIRST_UTTERANCE_POLICY,
    random,
  });
}

function assignedEntry(
  selection: ReturnType<typeof selectFrequencyFirstUtterance>,
  slotKey: string,
): string {
  const assignment = selection.utterance.assignments.find((item) => item.slotKey === slotKey);
  if (assignment === undefined) throw new Error(`missing assignment for ${slotKey}`);
  return assignment.entryId;
}

function transitiveFixture() {
  const subjects = Array.from({ length: 30 }, (_, index) =>
    entry(`subject-${index.toString().padStart(2, "0")}`)
  );
  const verbs = Array.from({ length: 50 }, (_, index) =>
    entry(`verb-${index.toString().padStart(2, "0")}`)
  );
  const objects = Array.from({ length: 50 }, (_, index) =>
    entry(`object-${index.toString().padStart(2, "0")}`)
  );
  const entries = [...subjects, ...verbs, ...objects];
  const annotations = Object.fromEntries([
    ...subjects.map((item) => [item.id, annotation(item.id, ["subject"], "none")] as const),
    ...verbs.map((item) => [
      item.id,
      annotation(item.id, ["transitive-predicate"], "transitive"),
    ] as const),
    ...objects.map((item) => [item.id, annotation(item.id, ["object"], "none")] as const),
  ]);
  return { subjects, verbs, objects, entries, annotations };
}

describe("bounded slot-weighted utterance generation", () => {
  it("can reach a late subject without materializing the Cartesian-product prefix", () => {
    const fixture = transitiveFixture();
    const selection = select(
      fixture.entries,
      fixture.annotations,
      constantRandom(0.999_999),
    );

    expect(selection.utterance.templateId).toBe("subject-transitive-object");
    expect(assignedEntry(selection, "subject")).toBe("subject-29");
  });

  it("keeps every legal modal reachable beyond the old 2,000-candidate prefix", () => {
    const subject = entry("subject");
    const modals = ["modal-a", "modal-b", "modal-c", "modal-d"].map(entry);
    const verbs = Array.from({ length: 50 }, (_, index) =>
      entry(`verb-${index.toString().padStart(2, "0")}`)
    );
    const objects = Array.from({ length: 50 }, (_, index) =>
      entry(`object-${index.toString().padStart(2, "0")}`)
    );
    const entries = [subject, ...modals, ...verbs, ...objects];
    const annotations = Object.fromEntries([
      [subject.id, annotation(subject.id, ["subject"], "none")],
      ...modals.map((item) => [item.id, annotation(item.id, ["modal"], "modal")] as const),
      ...verbs.map((item) => [item.id, annotation(item.id, ["verb"], "transitive")] as const),
      ...objects.map((item) => [item.id, annotation(item.id, ["object"], "none")] as const),
    ]);

    const selectedModals = [0, 0.34, 0.67, 0.999_999].map((value) =>
      assignedEntry(select(entries, annotations, constantRandom(value)), "modal")
    );

    expect(selectedModals).toEqual(["modal-a", "modal-b", "modal-c", "modal-d"]);
  });

  it("is independent of input order and unrelated lexicographic prefixes", () => {
    const fixture = transitiveFixture();
    const baseline = select(
      fixture.entries,
      fixture.annotations,
      constantRandom(0.999_999),
    );
    const unrelated = entry("000-unrelated");
    const expandedAnnotations = {
      ...fixture.annotations,
      [unrelated.id]: annotation(unrelated.id, ["adverbial"], "none"),
    };
    const reordered = select(
      [unrelated, ...fixture.entries].reverse(),
      Object.fromEntries(Object.entries(expandedAnnotations).reverse()),
      constantRandom(0.999_999),
    );

    expect(reordered.utterance).toEqual(baseline.utterance);
  });

  it("keeps predicate frames and duplicate-entry exclusion as hard constraints", () => {
    const dual = entry("dual-subject-object");
    const object = entry("other-object");
    const correctVerb = entry("correct-verb");
    const wrongFrame = entry("wrong-frame");
    const entries = [dual, object, correctVerb, wrongFrame];
    const annotations = {
      [dual.id]: annotation(dual.id, ["subject", "object"], "none"),
      [object.id]: annotation(object.id, ["object"], "none"),
      [correctVerb.id]: annotation(
        correctVerb.id,
        ["transitive-predicate"],
        "transitive",
      ),
      [wrongFrame.id]: annotation(
        wrongFrame.id,
        ["transitive-predicate"],
        "intransitive",
      ),
    };

    const selection = select(entries, annotations, constantRandom(0));
    const entryIds = selection.utterance.entries.map((item) => item.id);
    const predicateTrace = selection.slotSelections.find((slot) => slot.slotKey === "predicate");

    expect(selection.utterance.templateId).toBe("subject-transitive-object");
    expect(new Set(entryIds).size).toBe(entryIds.length);
    expect(assignedEntry(selection, "subject")).toBe(dual.id);
    expect(assignedEntry(selection, "object")).toBe(object.id);
    expect(assignedEntry(selection, "predicate")).toBe(correctVerb.id);
    expect(predicateTrace?.candidates.map((candidate) => candidate.entryId))
      .toEqual([correctVerb.id]);
  });

  it("bounds generation work by slots and retries rather than sentence combinations", () => {
    const fixture = transitiveFixture();
    const generated = generateSlotWeightedGrammar({
      entries: fixture.entries,
      annotations: fixture.annotations,
      random: constantRandom(0.999_999),
      entryWeight: () => 1,
      templateWeight: () => 1,
    });

    expect(generated.candidate?.templateId).toBe("subject-transitive-object");
    expect(generated.slotAttempts).toBe(3);
    expect(generated.slotSelections.map((slot) => slot.candidates.length).sort((a, b) => a - b))
      .toEqual([30, 50, 50]);
  });

  it("does not expose a global grammar-candidate cap in the runtime policy", () => {
    expect("maximumGrammarCandidates" in FREQUENCY_FIRST_UTTERANCE_POLICY).toBe(false);
  });
});
