import type {
  CatalogEntry,
  FrequencyBand,
  RandomSource,
} from "../../src/core/model.js";
import type { RelationObjective } from "../../src/curriculum/objectives.js";
import {
  bindingRelationKey,
  transitionRelationKey,
} from "../../src/relations/catalog-occurrences.js";
import type {
  BindingOccurrence,
  CatalogRelationIndex,
  ConfusionContrastPool,
  RelationSupportSummary,
  TransitionOccurrence,
} from "../../src/relations/types.js";
import type {
  CompositionInput,
  CompositionPolicy,
  PracticeBudget,
  RecentSequenceHistory,
} from "../../src/composition/types.js";

export function constantRandom(value = 0.5): RandomSource {
  return { next: () => value };
}

export function sequenceRandom(values: readonly number[]): RandomSource {
  let index = 0;
  return {
    next(): number {
      const value = values[index] ?? values[values.length - 1] ?? 0.5;
      index += 1;
      return value;
    },
  };
}

export function entry(
  id: string,
  syllables: readonly (readonly string[])[],
  frequencyBand: FrequencyBand = 1,
  tags: readonly string[] = ["general"],
): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: syllables.map((tokens) => ({ tokens })),
    frequencyBand,
    tags,
    provenanceIds: ["test"],
  };
}

export function bindingOccurrence(
  catalogEntry: CatalogEntry,
  tokenId: string,
  syllableIndex = 0,
  tokenIndex = 0,
  partition: "training" | "evaluation" = "training",
): BindingOccurrence {
  return {
    kind: "binding",
    entryId: catalogEntry.id,
    syllableIndex,
    tokenIndex,
    tokenId,
    context: tokenId.startsWith("tone:")
      ? "tone"
      : tokenIndex === 0
        ? "syllable-start"
        : "within-syllable",
    entryInitial: syllableIndex === 0 && tokenIndex === 0,
    frequencyBand: catalogEntry.frequencyBand,
    tags: catalogEntry.tags,
    provenanceIds: catalogEntry.provenanceIds,
    partition,
  };
}

export function transitionOccurrence(
  catalogEntry: CatalogEntry,
  fromToken: string,
  toToken: string,
  syllableIndex = 0,
  fromTokenIndex = 0,
  partition: "training" | "evaluation" = "training",
): TransitionOccurrence {
  return {
    kind: "transition",
    entryId: catalogEntry.id,
    syllableIndex,
    fromTokenIndex,
    fromToken,
    toToken,
    frequencyBand: catalogEntry.frequencyBand,
    tags: catalogEntry.tags,
    provenanceIds: catalogEntry.provenanceIds,
    partition,
  };
}

function supportSummary(
  relation: RelationSupportSummary["relation"],
  occurrences: readonly (BindingOccurrence | TransitionOccurrence)[],
): RelationSupportSummary {
  const training = occurrences.filter((occurrence) => occurrence.partition === "training");
  const evaluation = occurrences.filter((occurrence) => occurrence.partition === "evaluation");
  const trainingEntries = new Set(training.map((occurrence) => occurrence.entryId));
  const evaluationEntries = new Set(evaluation.map((occurrence) => occurrence.entryId));
  const frequencyBandCounts = {
    1: occurrences.filter((occurrence) => occurrence.frequencyBand === 1).length,
    2: occurrences.filter((occurrence) => occurrence.frequencyBand === 2).length,
    3: occurrences.filter((occurrence) => occurrence.frequencyBand === 3).length,
  } as const;
  return {
    relation,
    occurrenceCount: occurrences.length,
    distinctEntryCount: new Set(occurrences.map((occurrence) => occurrence.entryId)).size,
    frequencyBandCounts,
    commonEntryCount: new Set(occurrences
      .filter((occurrence) => occurrence.frequencyBand === 1)
      .map((occurrence) => occurrence.entryId)).size,
    entryConcentration: occurrences.length === 0 ? 0 : 1,
    trainingOccurrenceCount: training.length,
    trainingDistinctEntryCount: trainingEntries.size,
    trainingCommonEntryCount: new Set(training
      .filter((occurrence) => occurrence.frequencyBand === 1)
      .map((occurrence) => occurrence.entryId)).size,
    trainingEntryConcentration: training.length === 0 ? 0 : 1,
    evaluationOccurrenceCount: evaluation.length,
    evaluationDistinctEntryCount: evaluationEntries.size,
    evaluationCommonEntryCount: new Set(evaluation
      .filter((occurrence) => occurrence.frequencyBand === 1)
      .map((occurrence) => occurrence.entryId)).size,
    supportState: training.length === 0 ? "unsupported" : "supported",
  };
}

export function relationIndex(options: {
  readonly bindings?: readonly BindingOccurrence[];
  readonly transitions?: readonly TransitionOccurrence[];
  readonly confusionPools?: Readonly<Record<string, ConfusionContrastPool>>;
} = {}): CatalogRelationIndex {
  const bindingOccurrences: Record<string, BindingOccurrence[]> = {};
  for (const occurrence of options.bindings ?? []) {
    const key = bindingRelationKey(occurrence.tokenId);
    bindingOccurrences[key] = [...(bindingOccurrences[key] ?? []), occurrence];
  }
  const transitionOccurrences: Record<string, TransitionOccurrence[]> = {};
  for (const occurrence of options.transitions ?? []) {
    const key = transitionRelationKey(occurrence.fromToken, occurrence.toToken);
    transitionOccurrences[key] = [...(transitionOccurrences[key] ?? []), occurrence];
  }
  const support: Record<string, RelationSupportSummary> = {};
  for (const [key, occurrences] of Object.entries(bindingOccurrences)) {
    const tokenId = occurrences[0]!.tokenId;
    support[key] = supportSummary({
      kind: "binding",
      scope: { mode: "guided", layoutId: "zhuyin-standard", tokenId },
    }, occurrences);
  }
  for (const [key, occurrences] of Object.entries(transitionOccurrences)) {
    const first = occurrences[0]!;
    support[key] = supportSummary({
      kind: "transition",
      scope: {
        mode: "guided",
        layoutId: "zhuyin-standard",
        fromToken: first.fromToken,
        toToken: first.toToken,
      },
    }, occurrences);
  }
  return {
    bindingOccurrences,
    transitionOccurrences,
    support,
    confusionContrastPools: options.confusionPools ?? {},
  };
}

export function transitionObjective(
  fromToken = "ㄓ",
  toToken = "ㄨ",
): RelationObjective {
  return {
    kind: "transition",
    relation: {
      kind: "transition",
      scope: {
        mode: "guided",
        layoutId: "zhuyin-standard",
        fromToken,
        toToken,
      },
    },
  };
}

export function bindingObjective(tokenId = "ㄓ"): RelationObjective {
  return {
    kind: "binding",
    relation: {
      kind: "binding",
      scope: {
        mode: "guided",
        layoutId: "zhuyin-standard",
        tokenId,
      },
    },
  };
}

export function budget(
  override: Partial<Omit<PracticeBudget, "targetExposures">> & {
    readonly targetExposures?: Partial<PracticeBudget["targetExposures"]>;
  } = {},
): PracticeBudget {
  return {
    targetExposures: {
      minimum: override.targetExposures?.minimum ?? 1,
      preferred: override.targetExposures?.preferred ?? 1,
      maximum: override.targetExposures?.maximum ?? 6,
    },
    maximumTokens: override.maximumTokens ?? 64,
    maximumSyllables: override.maximumSyllables ?? 24,
    maximumLexicalBoundaries: override.maximumLexicalBoundaries ?? 12,
    minimumCommonWordShare: override.minimumCommonWordShare ?? 0,
    maximumSameEntryRepetition: override.maximumSameEntryRepetition ?? 1,
    maximumRelationConcentration: override.maximumRelationConcentration ?? 1,
    recentEntryPenalty: override.recentEntryPenalty ?? 0,
    recentTokenPathPenalty: override.recentTokenPathPenalty ?? 0,
    marginalGainThreshold: override.marginalGainThreshold ?? 0,
  };
}

export function policy(
  strategy: CompositionPolicy["strategy"] = "greedy-marginal-gain",
  beamWidth = 4,
): CompositionPolicy {
  return { strategy, beamWidth };
}

export const emptyHistory: RecentSequenceHistory = {
  entryIds: [],
  tokenPathSignatures: [],
};

export function input(options: {
  readonly objective?: RelationObjective;
  readonly entries: readonly CatalogEntry[];
  readonly index: CatalogRelationIndex;
  readonly budget?: PracticeBudget;
  readonly policy?: CompositionPolicy;
  readonly history?: RecentSequenceHistory;
  readonly random?: RandomSource;
}): CompositionInput {
  return {
    objective: options.objective ?? transitionObjective(),
    relationIndex: options.index,
    entries: options.entries,
    history: options.history ?? emptyHistory,
    budget: options.budget ?? budget(),
    policy: options.policy ?? policy(),
    random: options.random ?? constantRandom(),
  };
}
