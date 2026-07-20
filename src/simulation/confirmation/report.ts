import { stableDigest, stableStringify } from "../../composition/stable.js";
import {
  roundHasAnyFallback,
  roundHasBlockingFallback,
} from "../analysis/fallback-policy.js";
import { RELATIONAL_ANALYSIS_POLICY } from "../analysis/policy.js";
import type { ExperimentMetricKey } from "../analysis/types.js";
import {
  compareExperimentRuns,
  runRelationalExperimentCell,
} from "../experiment/run-cell.js";
import type {
  RelationalExperimentMetrics,
  RelationalExperimentRoundRecord,
  RelationalExperimentRunRecord,
} from "../experiment/types.js";
import {
  canonicalizeRelationalConfirmationPlan,
  confirmationExperimentPlan,
  relationalConfirmationPlanDigest,
} from "./plan.js";
import {
  RELATIONAL_CONFIRMATION_POLICY,
  type RelationalConfirmationPolicy,
} from "./policy.js";
import type {
  CanonicalConfirmationCellDeclaration,
  ConfirmationDecision,
  ConfirmationRoundTrajectory,
  ConfirmationRunSummary,
  ConfirmationSurvivalRecord,
  RelationalConfirmationPlan,
  RelationalConfirmationReport,
} from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function errorMean(
  round: RelationalExperimentRoundRecord,
  kind: string,
): number | null {
  return round.cumulativeEstimationError.meanAbsoluteErrorByKind[kind] ?? null;
}

function compactTrajectory(
  round: RelationalExperimentRoundRecord,
  hiddenWeaknessRelationKeys: readonly string[],
): ConfirmationRoundTrajectory {
  const objectiveFallback = round.objectiveDecision.fallbackReason;
  const sequenceFallbacks = round.sequence?.fallbackReasons ?? [];
  const totalFallbackCodes = uniqueSorted([
    ...(objectiveFallback === null ? [] : [objectiveFallback]),
    ...sequenceFallbacks,
  ]);
  const blockingFallbackCodes = uniqueSorted([
    ...(objectiveFallback !== null
      && !RELATIONAL_ANALYSIS_POLICY.nonBlockingObjectiveFallbackCodes.includes(objectiveFallback)
      ? [objectiveFallback]
      : []),
    ...sequenceFallbacks,
  ]);
  const weaknessSet = new Set(hiddenWeaknessRelationKeys);
  return {
    round: round.round,
    objectiveRelationKeys: [...round.objectiveRelationKeys].sort(compareText),
    selectedEntryIds: round.sequence?.items.map((item) => item.entry.id) ?? [],
    tokenCount: round.sequence?.tokenCount ?? 0,
    syllableCount: round.sequence?.syllableCount ?? 0,
    stopReason: round.sequence?.stopReason ?? null,
    totalFallbackCodes,
    blockingFallbackCodes,
    failureCodes: uniqueSorted(round.failures.map((failure) =>
      `${failure.stage}:${failure.code}`
    )),
    hiddenWeaknessHit: round.objectiveRelationKeys.some((key) => weaknessSet.has(key)),
    bindingEstimateMeanAbsoluteError: errorMean(round, "binding"),
    transitionEstimateMeanAbsoluteErrorMs: errorMean(round, "transition"),
    confusionEstimateMeanAbsoluteError: errorMean(round, "confusion"),
  };
}

function compactRun(
  run: RelationalExperimentRunRecord,
  declaration: CanonicalConfirmationCellDeclaration,
): ConfirmationRunSummary {
  const trajectories = run.rounds.map((round) =>
    compactTrajectory(round, run.hiddenWeaknessRelationKeys)
  );
  const body = {
    id: stableStringify(["confirmation-run", run.cell.id, run.scenarioId, run.seed]),
    cell: run.cell,
    role: declaration.role,
    hypothesisId: declaration.hypothesisId,
    matchedReferenceCellId: declaration.matchedReferenceCellId,
    scenarioId: run.scenarioId,
    seed: run.seed,
    evaluationEntryIds: [...(run.partitionDecision?.evaluationEntryIds ?? [])].sort(compareText),
    trajectories,
    finalMetrics: run.metrics,
    executableRoundCount: run.rounds.filter((round) => round.learnerBatch !== null).length,
    totalFallbackCount: run.rounds.filter(roundHasAnyFallback).length,
    blockingFallbackCount: run.rounds.filter((round) =>
      roundHasBlockingFallback(round, RELATIONAL_ANALYSIS_POLICY)
    ).length,
    failureCount: run.rounds.filter((round) => round.failures.length > 0).length,
  };
  return { ...body, determinismDigest: stableDigest(body) };
}

interface MetricDirectionResult {
  readonly identifiable: boolean;
  readonly materialImprovement: boolean;
  readonly materialRegression: boolean;
}

function compareMetric(
  key: ExperimentMetricKey,
  cell: RelationalExperimentMetrics,
  reference: RelationalExperimentMetrics,
): MetricDirectionResult {
  const rule = RELATIONAL_ANALYSIS_POLICY.metrics[key];
  const cellValue = cell[key].value;
  const referenceValue = reference[key].value;
  if (rule.direction === "descriptive-only") {
    return {
      identifiable: cellValue !== null && referenceValue !== null,
      materialImprovement: false,
      materialRegression: false,
    };
  }
  if (cellValue === null || referenceValue === null) {
    return {
      identifiable: false,
      materialImprovement: false,
      materialRegression: false,
    };
  }
  const absoluteDelta = cellValue - referenceValue;
  const improvement = rule.direction === "lower-is-better"
    ? -absoluteDelta
    : absoluteDelta;
  const relativeImprovement = referenceValue === 0
    ? null
    : improvement / Math.abs(referenceValue);
  const absolutePass = Math.abs(improvement) >= rule.materialAbsoluteDelta;
  const relativePass = rule.materialRelativeDelta === 0
    || referenceValue === 0
    || (relativeImprovement !== null
      && Math.abs(relativeImprovement) >= rule.materialRelativeDelta);
  return {
    identifiable: true,
    materialImprovement: improvement > 0 && absolutePass && relativePass,
    materialRegression: improvement < 0 && absolutePass && relativePass,
  };
}

interface SeedAssessment {
  readonly status: "pass" | "no-improvement" | "missing" | "reject";
  readonly reasons: readonly string[];
}

function assessSeed(
  run: ConfirmationRunSummary,
  reference: ConfirmationRunSummary,
  primaryMetrics: readonly ExperimentMetricKey[],
  policy: RelationalConfirmationPolicy,
): SeedAssessment {
  const reasons: string[] = [];
  if (run.failureCount > 0) reasons.push("non-zero-failure-count");
  const blockingRate = run.trajectories.length === 0
    ? 0
    : run.blockingFallbackCount / run.trajectories.length;
  if (blockingRate > policy.maximumBlockingFallbackRate) {
    reasons.push("blocking-fallback-rate-above-threshold");
  }
  const protectedKeys = (Object.entries(RELATIONAL_ANALYSIS_POLICY.metrics) as Array<[
    ExperimentMetricKey,
    (typeof RELATIONAL_ANALYSIS_POLICY.metrics)[ExperimentMetricKey],
  ]>)
    .filter(([, rule]) => rule.role === "protected")
    .map(([key]) => key);
  const protectedRegression = protectedKeys.filter((key) =>
    compareMetric(key, run.finalMetrics, reference.finalMetrics).materialRegression
  );
  if (protectedRegression.length > 0) {
    reasons.push(...protectedRegression.map((key) => `protected-regression:${key}`));
  }
  const primary = primaryMetrics.map((key) => [
    key,
    compareMetric(key, run.finalMetrics, reference.finalMetrics),
  ] as const);
  const missing = primary.filter(([, result]) => !result.identifiable);
  const regressions = primary.filter(([, result]) => result.materialRegression);
  const improvements = primary.filter(([, result]) => result.materialImprovement);
  if (regressions.length > 0) {
    reasons.push(...regressions.map(([key]) => `contradictory-primary-regression:${key}`));
  }
  if (reasons.length > 0) return { status: "reject", reasons: uniqueSorted(reasons) };
  if (missing.length > 0) {
    return {
      status: "missing",
      reasons: missing.map(([key]) => `primary-metric-not-identifiable:${key}`).sort(compareText),
    };
  }
  if (improvements.length === 0) {
    return { status: "no-improvement", reasons: ["no-material-primary-improvement"] };
  }
  return {
    status: "pass",
    reasons: improvements.map(([key]) => `material-improvement:${key}`).sort(compareText),
  };
}

function survivalDecision(
  runs: readonly ConfirmationRunSummary[],
  allRuns: readonly ConfirmationRunSummary[],
  policy: RelationalConfirmationPolicy,
): ConfirmationSurvivalRecord {
  const first = runs[0]!;
  const seedCount = new Set(runs.map((run) => run.seed)).size;
  if (first.role === "historical-baseline") {
    return {
      cellId: first.cell.id,
      scenarioId: first.scenarioId,
      role: first.role,
      hypothesisId: first.hypothesisId,
      seedCount,
      runCount: runs.length,
      decision: "inconclusive",
      reasons: ["historical-baseline-reference"],
    };
  }
  const primaryMetrics = policy.scenarioPrimaryMetrics[first.scenarioId];
  if (primaryMetrics === undefined || primaryMetrics.length === 0) {
    return {
      cellId: first.cell.id,
      scenarioId: first.scenarioId,
      role: first.role,
      hypothesisId: first.hypothesisId,
      seedCount,
      runCount: runs.length,
      decision: "inconclusive",
      reasons: ["scenario-primary-metrics-not-declared"],
    };
  }
  const assessments: SeedAssessment[] = [];
  for (const run of runs) {
    const reference = allRuns.find((candidate) =>
      candidate.cell.id === run.matchedReferenceCellId
      && candidate.scenarioId === run.scenarioId
      && candidate.seed === run.seed
    );
    if (reference === undefined) {
      assessments.push({ status: "reject", reasons: ["missing-matched-reference-run"] });
    } else {
      assessments.push(assessSeed(run, reference, primaryMetrics, policy));
    }
  }
  const count = (status: SeedAssessment["status"]) =>
    assessments.filter((assessment) => assessment.status === status).length;
  const rejected = count("reject");
  const missing = count("missing");
  const passed = count("pass");
  const noImprovement = count("no-improvement");
  const passShare = assessments.length === 0 ? 0 : passed / assessments.length;
  let decision: ConfirmationDecision;
  if (rejected > 0) decision = "rejected";
  else if (missing > 0) decision = "inconclusive";
  else if (passShare >= policy.minimumSurvivingSeedShare) decision = "survives-confirmation";
  else if (passShare >= policy.minimumScenarioLimitedSeedShare) decision = "scenario-limited";
  else if (passed === 0 && noImprovement > 0) decision = "rejected";
  else decision = "inconclusive";
  return {
    cellId: first.cell.id,
    scenarioId: first.scenarioId,
    role: first.role,
    hypothesisId: first.hypothesisId,
    seedCount,
    runCount: runs.length,
    decision,
    reasons: uniqueSorted([
      `seed-pass:${passed}/${assessments.length}`,
      `seed-no-improvement:${noImprovement}/${assessments.length}`,
      `seed-missing:${missing}/${assessments.length}`,
      `seed-rejected:${rejected}/${assessments.length}`,
      ...assessments.flatMap((assessment) => assessment.reasons),
    ]),
  };
}

function buildSurvival(
  runs: readonly ConfirmationRunSummary[],
  policy: RelationalConfirmationPolicy,
): readonly ConfirmationSurvivalRecord[] {
  const groups = new Map<string, ConfirmationRunSummary[]>();
  for (const run of runs) {
    const key = stableStringify([run.cell.id, run.scenarioId]);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()]
    .map((group) => survivalDecision(group, runs, policy))
    .sort((left, right) => compareText(left.scenarioId, right.scenarioId)
      || compareText(left.cellId, right.cellId));
}

export function runRelationalConfirmation(
  inputPlan: RelationalConfirmationPlan,
  policy: RelationalConfirmationPolicy = RELATIONAL_CONFIRMATION_POLICY,
): RelationalConfirmationReport {
  const plan = canonicalizeRelationalConfirmationPlan(inputPlan);
  if (plan.sourceFindingsPolicyVersion !== policy.sourceAnalysisPolicyVersion) {
    throw new Error("confirmation plan source findings policy does not match confirmation policy");
  }
  for (const scenarioId of plan.scenarioIds) {
    if (policy.scenarioPrimaryMetrics[scenarioId] === undefined) {
      throw new Error(`confirmation policy has no primary metrics for ${scenarioId}`);
    }
  }
  const experimentPlan = confirmationExperimentPlan(plan);
  const runs: ConfirmationRunSummary[] = [];
  for (const declaration of plan.cells) {
    for (const scenarioId of plan.scenarioIds) {
      for (const seed of plan.seeds) {
        const full = runRelationalExperimentCell(
          experimentPlan,
          declaration.cell,
          scenarioId,
          seed,
        );
        runs.push(compactRun(full, declaration));
      }
    }
  }
  runs.sort((left, right) => compareText(left.cell.id, right.cell.id)
    || compareText(left.scenarioId, right.scenarioId)
    || left.seed - right.seed);
  const survival = buildSurvival(runs, policy);
  const body = {
    schemaVersion: "relational-confirmation-report-v1" as const,
    planId: plan.id,
    planDigest: relationalConfirmationPlanDigest(inputPlan),
    sourceFindingsPolicyVersion: plan.sourceFindingsPolicyVersion,
    baselineCellId: plan.baselineCellId,
    runCount: runs.length,
    roundCount: runs.reduce((sum, run) => sum + run.trajectories.length, 0),
    runs,
    survival,
    limitations: [
      "Synthetic confirmation does not establish human learning effectiveness.",
      "Survives-confirmation means robust under this declared cohort and policy only.",
      "Compact trajectories omit raw trace events while preserving objectives, outcomes, errors, failures, and fallbacks.",
      "Matched ablations are interpretable only when exactly one declared strategy axis changes.",
      "Browser/UI work, auto-advance, and human pilot remain deferred.",
    ] as const,
  };
  return { ...body, determinismDigest: stableDigest(body) };
}

export function serializeRelationalConfirmationReport(
  report: RelationalConfirmationReport,
): string {
  return `${stableStringify(report)}\n`;
}
