import { describe, expect, it } from "vitest";
import type { CatalogEntry, RandomSource } from "../../src/core/model.js";
import {
  FREQUENCY_FIRST_UTTERANCE_POLICY,
  createFrequencyFirstSelectionState,
  selectFrequencyFirstUtterance,
  updateFrequencyFirstSelectionState,
  type EntrySelectionScore,
  type FrequencyFirstUtteranceSelection,
} from "../../src/curriculum/frequency-first-utterance.js";
import { bindingScopeKey, confusionScopeKey, transitionScopeKey } from "../../src/measurement/aggregate.js";
import type { MeasurementSummary } from "../../src/measurement/types.js";
import type { GrammarAnnotation } from "../../src/grammar/types.js";

const mode = "guided" as const;
const layoutId = "standard";

function random(value: number): RandomSource {
  return { next: () => value };
}

function entry(
  id: string,
  text: string,
  frequencyBand: 1 | 2 | 3,
  tokens: readonly string[],
): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens }],
    frequencyBand,
    tags: ["test"],
    provenanceIds: ["test:frequency"],
  };
}

const common = entry("common", "謝謝", 1, ["zhuyin:ㄒ", "zhuyin:ㄧ", "tone:4"]);
const lessCommon = entry("less-common", "再見", 2, ["zhuyin:ㄗ", "zhuyin:ㄞ", "tone:4"]);

const annotations: Readonly<Record<string, GrammarAnnotation>> = {
  common: {
    entryId: "common",
    roles: ["formulaic"],
    predicateFrame: "none",
    standaloneKind: "utterance",
    provenanceIds: ["test:frequency"],
  },
  "less-common": {
    entryId: "less-common",
    roles: ["formulaic"],
    predicateFrame: "none",
    standaloneKind: "utterance",
    provenanceIds: ["test:frequency"],
  },
};

function emptyMeasurement(): MeasurementSummary {
  return {
    policyVersion: "phase-3-v1",
    traceCount: 0,
    bindingObservationCount: 0,
    confusionObservationCount: 0,
    transitionObservationCount: 0,
    bindings: {},
    confusions: {},
    transitions: {},
  };
}

function input(
  stage: 1 | 2 | 3,
  measurement: MeasurementSummary = emptyMeasurement(),
  entries: readonly CatalogEntry[] = [common, lessCommon],
) {
  return {
    entries,
    annotations,
    measurement,
    mode,
    layoutId,
    stage,
    history: {
      recentEntryIds: [],
      recentUtteranceIds: [],
      recentTemplateIds: [],
    },
    policy: FREQUENCY_FIRST_UTTERANCE_POLICY,
    random: random(0),
  } as const;
}

function slotCandidate(
  selection: FrequencyFirstUtteranceSelection,
  entryId: string,
): EntrySelectionScore {
  const candidate = selection.slotSelections
    .flatMap((slot) => slot.candidates)
    .find((item) => item.entryId === entryId);
  if (candidate === undefined) throw new Error(`missing slot candidate: ${entryId}`);
  return candidate;
}

function weakLessCommonMeasurement(): MeasurementSummary {
  const tokenId = "zhuyin:ㄗ";
  const bindingKey = bindingScopeKey({ mode, layoutId, tokenId });
  const transitionKey = transitionScopeKey({
    mode,
    layoutId,
    fromToken: "zhuyin:ㄗ",
    toToken: "zhuyin:ㄞ",
  });
  return {
    policyVersion: "phase-3-v1",
    traceCount: 20,
    bindingObservationCount: 10,
    confusionObservationCount: 0,
    transitionObservationCount: 4,
    bindings: {
      [bindingKey]: {
        scope: { mode, layoutId, tokenId },
        attempts: 10,
        errors: 5,
        timingSamples: 4,
        currentTimeToTypeMs: 600,
        bestTimeToTypeMs: 300,
        timingExclusions: {
          syllableStart: 0,
          incorrect: 0,
          recovery: 0,
          interactionNoise: 0,
        },
      },
    },
    confusions: {},
    transitions: {
      [transitionKey]: {
        scope: {
          mode,
          layoutId,
          fromToken: "zhuyin:ㄗ",
          toToken: "zhuyin:ㄞ",
        },
        timingSamples: 4,
        currentTimeToTypeMs: 500,
        bestTimeToTypeMs: 250,
      },
    },
  };
}

describe("frequency-first grammatical utterance policy", () => {
  it("keeps locked frequency bands out of the slot candidate universe", () => {
    const selection = selectFrequencyFirstUtterance(input(1, weakLessCommonMeasurement()));
    expect(selection.slotSelections).toHaveLength(1);
    expect(selection.slotSelections[0]?.candidates.map((candidate) => candidate.entryId))
      .toEqual(["common"]);
    expect(selection.utterance.entries.map((candidate) => candidate.id)).toEqual(["common"]);
  });

  it("adds bounded expected-token and exact-transition weight without erasing frequency priority", () => {
    const selection = selectFrequencyFirstUtterance(input(2, weakLessCommonMeasurement()));
    const commonScore = slotCandidate(selection, "common");
    const weakScore = slotCandidate(selection, "less-common");
    expect(weakScore.expectedTokenBoost).toBeGreaterThan(1);
    expect(weakScore.transitionBoost).toBeGreaterThan(1);
    expect(weakScore.combinedLearnerBoost)
      .toBeLessThanOrEqual(FREQUENCY_FIRST_UTTERANCE_POLICY.maximumCombinedLearnerBoost);
    expect(weakScore.totalWeight).toBeLessThan(commonScore.totalWeight);
  });

  it("does not read expected-to-actual confusion aggregates for curriculum scoring", () => {
    const measurement = weakLessCommonMeasurement();
    const confusionKey = confusionScopeKey({
      mode,
      layoutId,
      expectedToken: "zhuyin:ㄗ",
      actualToken: "zhuyin:ㄓ",
    });
    const withConfusion: MeasurementSummary = {
      ...measurement,
      traceCount: measurement.traceCount + 99,
      confusionObservationCount: 99,
      confusions: {
        [confusionKey]: {
          scope: {
            mode,
            layoutId,
            expectedToken: "zhuyin:ㄗ",
            actualToken: "zhuyin:ㄓ",
          },
          occurrences: 99,
        },
      },
    };
    expect(selectFrequencyFirstUtterance(input(2, withConfusion)).slotSelections)
      .toEqual(selectFrequencyFirstUtterance(input(2, measurement)).slotSelections);
  });

  it("penalizes recent utterances without making them invalid", () => {
    const baseline = selectFrequencyFirstUtterance(input(1));
    const repeated = selectFrequencyFirstUtterance({
      ...input(1),
      history: {
        recentEntryIds: ["common"],
        recentUtteranceIds: [baseline.utterance.id],
        recentTemplateIds: [baseline.utterance.templateId!],
      },
    });
    expect(repeated.utterance.id).toBe(baseline.utterance.id);
    expect(repeated.score.recentEntryFactor).toBeLessThan(1);
    expect(repeated.score.recentUtteranceFactor).toBeLessThan(1);
    expect(repeated.score.recentTemplateFactor).toBeLessThan(1);
    expect(repeated.score.totalWeight).toBeLessThan(baseline.score.totalWeight);
  });

  it("replays identically after reversing catalog and annotation order", () => {
    const forward = selectFrequencyFirstUtterance(input(2, weakLessCommonMeasurement()));
    const reversedAnnotations = Object.fromEntries(Object.entries(annotations).reverse());
    const reversed = selectFrequencyFirstUtterance({
      ...input(2, weakLessCommonMeasurement(), [lessCommon, common]),
      annotations: reversedAnnotations,
    });
    expect(reversed).toEqual(forward);
  });

  it("unlocks the next stage only after enough accurate practice", () => {
    const policy = FREQUENCY_FIRST_UTTERANCE_POLICY;
    const selection = selectFrequencyFirstUtterance(input(1));
    let state = createFrequencyFirstSelectionState(policy);
    state = updateFrequencyFirstSelectionState(state, selection, 15, 1, policy);
    state = updateFrequencyFirstSelectionState(state, selection, 15, 1, policy);
    expect(state.stage).toBe(1);
    state = updateFrequencyFirstSelectionState(state, selection, 15, 1, policy);
    expect(state).toMatchObject({
      stage: 2,
      stagePracticeRounds: 0,
      stageAttempts: 0,
      stageErrors: 0,
    });
  });

  it("does not unlock when the stage error rate is too high", () => {
    const policy = FREQUENCY_FIRST_UTTERANCE_POLICY;
    const selection = selectFrequencyFirstUtterance(input(1));
    let state = createFrequencyFirstSelectionState(policy);
    for (let round = 0; round < 3; round += 1) {
      state = updateFrequencyFirstSelectionState(state, selection, 15, 5, policy);
    }
    expect(state.stage).toBe(1);
  });
});
