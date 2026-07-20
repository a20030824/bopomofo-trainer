import type {
  CatalogEntry,
  Exercise,
  PracticeMode,
} from "../core/model.js";
import { composePracticeSequence } from "../composition/composer.js";
import { stableDigest, stableStringify } from "../composition/stable.js";
import type {
  CompositionPolicy,
  PracticeBudget,
  PracticeSequence,
  RecentSequenceHistory,
} from "../composition/types.js";
import type { RelationObjective } from "../curriculum/objectives.js";
import { createSeededRandom } from "../curriculum/random.js";
import { semanticReferenceIdentity } from "../reference/identity.js";
import { importReferenceSource } from "../reference/importers/import-reference-source.js";
import { createTabularReferenceSourceAdapter } from "../reference/importers/tabular-adapter.js";
import type {
  ReferenceImportResult,
  TabularReferenceAdapterConfig,
} from "../reference/importers/types.js";
import { buildReferenceReviewQueue } from "../reference/ranking.js";
import type {
  ReferenceRankingProfile,
  ReferenceReviewQueue,
} from "../reference/ranking-types.js";
import type { ReferenceSourceManifest } from "../reference/types.js";
import {
  createRelationalCatalogReport,
  type RelationalCatalogReport,
} from "../relations/catalog-report.js";
import { partitionRelationSupportPreserving } from "../relations/partition/strategies.js";
import type {
  PartitionDecision,
  PartitionPolicyOptions,
} from "../relations/partition/types.js";
import type { CatalogPartition } from "../relations/types.js";
import { getSyntheticScenario } from "../simulation/learner/scenarios.js";
import type {
  SyntheticScenario,
  SyntheticTraceBatch,
} from "../simulation/learner/types.js";
import { generateSyntheticTraceBatch } from "../simulation/trace-generator/generate.js";

export interface RelationalResearchIntegrationFixture {
  readonly id: string;
  readonly reference: {
    readonly manifest: ReferenceSourceManifest;
    readonly adapter: TabularReferenceAdapterConfig;
    readonly rankingProfile: ReferenceRankingProfile;
  };
  readonly reviewedCatalog: readonly CatalogEntry[];
  readonly partition: PartitionPolicyOptions;
  readonly composition: {
    readonly objective: RelationObjective;
    readonly history: RecentSequenceHistory;
    readonly budget: PracticeBudget;
    readonly policy: CompositionPolicy;
    readonly seed: number;
  };
  readonly learner: {
    readonly scenarioId: SyntheticScenario["id"];
    readonly seed: number;
    readonly startedAtMs: number;
  };
}

export interface RelationalResearchIntegrationDigest {
  readonly algorithm: "fnv1a32";
  readonly value: string;
  readonly canonicalizationReason: "recursive-code-unit-key-order";
}

export interface RelationalResearchIntegrationReport {
  readonly schemaVersion: "relational-research-integration-v1";
  readonly fixtureId: string;
  readonly reference: {
    readonly importResult: ReferenceImportResult;
    readonly reviewQueue: ReferenceReviewQueue;
    readonly approvalBoundary: "manual-review-required";
    readonly reviewedCatalogMutation: "none";
  };
  readonly partition: {
    readonly decision: PartitionDecision;
    readonly report: RelationalCatalogReport;
  };
  readonly composition: PracticeSequence;
  readonly learner: SyntheticTraceBatch;
  readonly determinismDigest: RelationalResearchIntegrationDigest;
}

interface ObjectiveScope {
  readonly mode: PracticeMode;
  readonly layoutId: string;
}

function explicitObjectiveScope(objective: RelationObjective): ObjectiveScope {
  if (objective.kind === "coverage") {
    throw new Error("integration fixture requires an explicit relation objective");
  }
  if (objective.kind !== "combined") {
    return {
      mode: objective.relation.scope.mode,
      layoutId: objective.relation.scope.layoutId,
    };
  }
  const first = objective.demands[0];
  if (first === undefined) {
    throw new Error("combined integration objective must contain at least one demand");
  }
  const scope = {
    mode: first.relation.scope.mode,
    layoutId: first.relation.scope.layoutId,
  };
  for (const demand of objective.demands) {
    if (demand.relation.scope.mode !== scope.mode
      || demand.relation.scope.layoutId !== scope.layoutId) {
      throw new Error("combined integration objective must use one mode and layout");
    }
  }
  return scope;
}

function partitionMap(
  entries: readonly CatalogEntry[],
  evaluationEntryIds: ReadonlySet<string>,
): Readonly<Record<string, CatalogPartition>> {
  return Object.fromEntries(entries.map((entry) => [
    entry.id,
    evaluationEntryIds.has(entry.id) ? "evaluation" : "training",
  ] as const));
}

function createReport(
  entries: readonly CatalogEntry[],
  scope: ObjectiveScope,
  evaluationEntryIds: ReadonlySet<string>,
): RelationalCatalogReport {
  return createRelationalCatalogReport(entries, {
    mode: scope.mode,
    layoutId: scope.layoutId,
    partitionByEntryId: partitionMap(entries, evaluationEntryIds),
  });
}

function sequenceExercise(sequence: PracticeSequence): Exercise {
  if (sequence.mode === null || sequence.layoutId === null) {
    throw new Error(`composition stopped before resolving mode/layout: ${sequence.stopReason}`);
  }
  if (sequence.items.length === 0) {
    throw new Error(`composition produced no learner input: ${sequence.stopReason}`);
  }
  return {
    id: `integration:${sequence.id}`,
    mode: sequence.mode,
    layoutId: sequence.layoutId,
    entries: sequence.items.map((item) => item.entry),
  };
}

export function runRelationalResearchIntegration(
  fixture: RelationalResearchIntegrationFixture,
  referenceInput: string,
): RelationalResearchIntegrationReport {
  const scope = explicitObjectiveScope(fixture.composition.objective);
  const initialReport = createReport(
    fixture.reviewedCatalog,
    scope,
    new Set<string>(),
  );

  const adapter = createTabularReferenceSourceAdapter(fixture.reference.adapter);
  const importResult = importReferenceSource(
    referenceInput,
    adapter,
    fixture.reference.manifest,
  );
  const reviewedIdentities = new Set(fixture.reviewedCatalog.map((entry) =>
    semanticReferenceIdentity(entry.prompt.text, entry.syllables)
  ));
  const reviewQueue = buildReferenceReviewQueue(
    importResult.accepted.map((accepted) => accepted.candidate),
    initialReport,
    fixture.reference.rankingProfile,
    { reviewedIdentities },
  );

  const decision = partitionRelationSupportPreserving(
    { entries: fixture.reviewedCatalog, report: initialReport },
    fixture.partition,
  );
  const evaluationEntryIds = new Set(decision.evaluationEntryIds);
  const partitionedReport = createReport(
    fixture.reviewedCatalog,
    scope,
    evaluationEntryIds,
  );

  const sequence = composePracticeSequence({
    objective: fixture.composition.objective,
    relationIndex: partitionedReport.index,
    entries: fixture.reviewedCatalog,
    history: fixture.composition.history,
    budget: fixture.composition.budget,
    policy: fixture.composition.policy,
    random: createSeededRandom(fixture.composition.seed),
  });

  const scenario = getSyntheticScenario(fixture.learner.scenarioId);
  if (scenario.layout.id !== scope.layoutId) {
    throw new Error(
      `learner layout ${scenario.layout.id} does not match integration layout ${scope.layoutId}`,
    );
  }
  const learner = generateSyntheticTraceBatch(
    sequenceExercise(sequence),
    scenario.layout,
    scenario.measurementPolicy,
    scenario.learner,
    {
      scenarioId: scenario.id,
      seed: fixture.learner.seed,
      startedAtMs: fixture.learner.startedAtMs,
      retentionSteps: scenario.retentionSteps,
    },
  );

  const body = {
    schemaVersion: "relational-research-integration-v1" as const,
    fixtureId: fixture.id,
    reference: {
      importResult,
      reviewQueue,
      approvalBoundary: "manual-review-required" as const,
      reviewedCatalogMutation: "none" as const,
    },
    partition: {
      decision,
      report: partitionedReport,
    },
    composition: sequence,
    learner,
  };

  return {
    ...body,
    determinismDigest: {
      algorithm: "fnv1a32",
      value: stableDigest(body),
      canonicalizationReason: "recursive-code-unit-key-order",
    },
  };
}

export function serializeRelationalResearchIntegrationReport(
  report: RelationalResearchIntegrationReport,
): string {
  return `${stableStringify(report)}\n`;
}
