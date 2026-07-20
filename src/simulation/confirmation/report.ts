import { stableDigest, stableStringify } from "../../composition/stable.js";
import {
  roundHasAnyFallback,
  roundHasBlockingFallback,
} from "../analysis/fallback-policy.js";
import { RELATIONAL_ANALYSIS_POLICY } from "../analysis/policy.js";
import type { ExperimentMetricKey } from "../analysis/types.js";
import { runRelationalExperimentCell } from "../experiment/run-cell.js";
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
import { RELATIONAL_CONFIRMATION_POLICY } from "./policy.js";
import type {
  CanonicalConfirmationCellDeclaration,
  ConfirmationDecision,
  ConfirmationHypothesisDecision,
  ConfirmationRoundTrajectory,
  ConfirmationRunSummary,
  ConfirmationSeedAssessment,
  ConfirmationSeedDecision,
  ConfirmationSurvivalRecord,
  RelationalConfirmationPlan,
  RelationalConfirmationPolicy,
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
    anchorScenarioIds: declaration.anchorScenarioIds,
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

function compareValues(
  key: ExperimentMetricKey,
  cellValue: number | null,
  referenceValue: number | null,
): MetricDirectionResult {
  const rule = RELATIONAL_ANALYSIS_POLICY.metrics[key];
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

function compareMetric(
  key: ExperimentMetricKey,
  cell: RelationalExperimentMetrics,
  reference: RelationalExperimentMetrics,
): MetricDirectionResult {
  return compareValues(key, cell[key].value, reference[key].value);
}

const TRAJECTORY_ERROR_METRICS = [
  "bindingEstimateMeanAbsoluteError",
  "transitionEstimateMeanAbsoluteErrorMs",
  "confusionEstimateMeanAbsoluteError",
] as const satisfies readonly ExperimentMetricKey[];

type TrajectoryErrorMetric = (typeof TRAJECTORY_ERROR_METRICS)[number];

function trajectoryValue(
  trajectory: ConfirmationRoundTrajectory,
  key: TrajectoryErrorMetric,
): number | null {
  return trajectory[key];
}

function trajectoryEvidence(
  run: ConfirmationRunSummary,
  reference: ConfirmationRunSummary,
  primaryMetrics: readonly ExperimentMetricKey[],
): {
  readonly reversals: readonly string[];
  readonly unsustained: readonly string[];
} {
  const referenceByRound = new Map(reference.trajectories.map((item) => [item.round, item]));
  const reversals: string[] = [];
  const unsustained: string[] = [];
  for (const key of TRAJECTORY_ERROR_METRICS) {
    if (!primaryMetrics.includes(key)) continue;
    const comparisons = run.trajectories.flatMap((trajectory) => {
      const referenceTrajectory = referenceByRound.get(trajectory.round);
      if (referenceTrajectory === undefined) return [];
      return [compareValues(
        key,
        trajectoryValue(trajectory, key),
        trajectoryValue(referenceTrajectory, key),
      )];
    });
    if (comparisons.length < 2) continue;
    const earlierImprovement = comparisons.slice(0, -1).some((item) =>
      item.materialImprovement
    );
    const final = comparisons.at(-1)!;
    if (earlierImprovement && final.materialRegression) {
      reversals.push(`trajectory-reversal:${key}`);
    } else if (earlierImprovement && !final.materialImprovement) {
      unsustained.push(`trajectory-improvement-not-sustained:${key}`);
    }
  }
  return {
    reversals: reversals.sort(compareText),
    unsustained: unsustained.sort(compareText),
  };
}

function protectedMetricKeys(): readonly ExperimentMetricKey[] {
  return (Object.entries(RELATIONAL_ANALYSIS_POLICY.metrics) as Array<[
    ExperimentMetricKey,
    (typeof RELATIONAL_ANALYSIS_POLICY.metrics)[ExperimentMetricKey],
  ]>)
    .filter(([, rule]) => rule.role === "protected")
    .map(([key]) => key);
}

function seedAssessment(
  run: ConfirmationRunSummary,
  reference: ConfirmationRunSummary,
  primaryMetrics: readonly ExperimentMetricKey[],
  policy: RelationalConfirmationPolicy,
): ConfirmationSeedAssessment {
  if (run.matchedReferenceCellId === null) {
    throw new Error(`non-baseline run has no matched reference: ${run.id}`);
  }
  const blockers: string[] = [];
  if (run.failureCount > 0) blockers.push("non-zero-failure-count");
  const blockingRate = run.trajectories.length === 0
    ? 0
    : run.blockingFallbackCount / run.trajectories.length;
  if (blockingRate > policy.maximumBlockingFallbackRate) {
    blockers.push("blocking-fallback-rate-above-threshold");
  }
  for (const key of protectedMetricKeys()) {
    if (compareMetric(key, run.finalMetrics, reference.finalMetrics).materialRegression) {
      blockers.push(`protected-regression:${key}`);
    }
  }
  const primary = primaryMetrics.map((key) => [
    key,
    compareMetric(key, run.finalMetrics, reference.finalMetrics),
  ] as const);
  for (const [key, result] of primary) {
    if (result.materialRegression) blockers.push(`contradictory-primary-regression:${key}`);
  }
  const trajectory = trajectoryEvidence(run, reference, primaryMetrics);
  blockers.push(...trajectory.reversals);

  let decision: ConfirmationSeedDecision;
  let reasons: readonly string[];
  if (blockers.length > 0) {
    decision = "rejected";
    reasons = uniqueSorted([...blockers, ...trajectory.unsustained]);
  } else {
    const missing = primary.filter(([, result]) => !result.identifiable);
    const improvements = primary.filter(([, result]) => result.materialImprovement);
    if (missing.length > 0) {
      decision = "missing-evidence";
      reasons = uniqueSorted([
        ...missing.map(([key]) => `primary-metric-not-identifiable:${key}`),
        ...trajectory.unsustained,
      ]);
    } else if (improvements.length === 0) {
      decision = "no-improvement";
      reasons = uniqueSorted([
        "no-material-primary-improvement",
        ...trajectory.unsustained,
      ]);
    } else {
      decision = "pass";
      reasons = uniqueSorted([
        ...improvements.map(([key]) => `material-improvement:${key}`),
        ...trajectory.unsustained,
      ]);
    }
  }
  return {
    cellId: run.cell.id,
    scenarioId: run.scenarioId,
    seed: run.seed,
    role: run.role,
    hypothesisId: run.hypothesisId,
    matchedReferenceCellId: run.matchedReferenceCellId,
    decision,
    reasons,
    trajectoryReversals: trajectory.reversals,
    unsustainedTrajectoryImprovements: trajectory.unsustained,
  };
}

function buildSeedAssessments(
  runs: readonly ConfirmationRunSummary[],
  policy: RelationalConfirmationPolicy,
): readonly ConfirmationSeedAssessment[] {
  const runMap = new Map(runs.map((run) => [
    stableStringify([run.cell.id, run.scenarioId, run.seed]),
    run,
  ] as const));
  const assessments: ConfirmationSeedAssessment[] = [];
  for (const run of runs) {
    if (run.role === "historical-baseline") continue;
    if (run.matchedReferenceCellId === null) {
      throw new Error(`non-baseline run has no matched reference: ${run.id}`);
    }
    const reference = runMap.get(stableStringify([
      run.matchedReferenceCellId,
      run.scenarioId,
      run.seed,
    ]));
    if (reference === undefined) {
      assessments.push({
        cellId: run.cell.id,
        scenarioId: run.scenarioId,
        seed: run.seed,
        role: run.role,
        hypothesisId: run.hypothesisId,
        matchedReferenceCellId: run.matchedReferenceCellId,
        decision: "rejected",
        reasons: ["missing-matched-reference-run"],
        trajectoryReversals: [],
        unsustainedTrajectoryImprovements: [],
      });
      continue;
    }
    const primaryMetrics = policy.scenarioPrimaryMetrics[run.scenarioId];
    if (primaryMetrics === undefined || primaryMetrics.length === 0) {
      assessments.push({
        cellId: run.cell.id,
        scenarioId: run.scenarioId,
        seed: run.seed,
        role: run.role,
        hypothesisId: run.hypothesisId,
        matchedReferenceCellId: run.matchedReferenceCellId,
        decision: "missing-evidence",
        reasons: ["scenario-primary-metrics-not-declared"],
        trajectoryReversals: [],
        unsustainedTrajectoryImprovements: [],
      });
      continue;
    }
    assessments.push(seedAssessment(run, reference, primaryMetrics, policy));
  }
  return assessments.sort((left, right) =>
    compareText(left.scenarioId, right.scenarioId)
      || compareText(left.cellId, right.cellId)
      || left.seed - right.seed
  );
}

function reasonCounts(
  assessments: readonly ConfirmationSeedAssessment[],
): readonly string[] {
  const counts = new Map<string, number>();
  for (const reason of assessments.flatMap((item) => item.reasons)) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([reason, count]) => `seed-reason:${reason}:${count}/${assessments.length}`);
}

function survivalDecision(
  runs: readonly ConfirmationRunSummary[],
  seedAssessments: readonly ConfirmationSeedAssessment[],
  policy: RelationalConfirmationPolicy,
): ConfirmationSurvivalRecord {
  const first = runs[0]!;
  const seedCount = new Set(runs.map((run) => run.seed)).size;
  const anchorScenario = first.anchorScenarioIds.includes(first.scenarioId);
  if (first.role === "historical-baseline") {
    return {
      cellId: first.cell.id,
      scenarioId: first.scenarioId,
      role: first.role,
      hypothesisId: first.hypothesisId,
      anchorScenario: false,
      seedCount,
      runCount: runs.length,
      passCount: 0,
      noImprovementCount: 0,
      missingEvidenceCount: 0,
      rejectedCount: 0,
      passShare: 0,
      rejectedShare: 0,
      decision: "inconclusive",
      reasons: ["historical-baseline-reference"],
    };
  }
  const count = (decision: ConfirmationSeedDecision) =>
    seedAssessments.filter((item) => item.decision === decision).length;
  const passed = count("pass");
  const noImprovement = count("no-improvement");
  const missing = count("missing-evidence");
  const rejected = count("rejected");
  const passShare = seedAssessments.length === 0 ? 0 : passed / seedAssessments.length;
  const rejectedShare = seedAssessments.length === 0 ? 0 : rejected / seedAssessments.length;
  let decision: ConfirmationDecision;
  if (passShare >= policy.minimumSurvivingSeedShare
    && rejectedShare <= policy.maximumRejectedSeedShare) {
    decision = "survives-confirmation";
  } else if (passShare >= policy.minimumScenarioLimitedSeedShare) {
    decision = "scenario-limited";
  } else if (rejectedShare >= 0.5) {
    decision = "rejected";
  } else if (missing > 0) {
    decision = "inconclusive";
  } else if (passed === 0 && noImprovement > 0) {
    decision = "rejected";
  } else {
    decision = "inconclusive";
  }
  return {
    cellId: first.cell.id,
    scenarioId: first.scenarioId,
    role: first.role,
    hypothesisId: first.hypothesisId,
    anchorScenario,
    seedCount,
    runCount: runs.length,
    passCount: passed,
    noImprovementCount: noImprovement,
    missingEvidenceCount: missing,
    rejectedCount: rejected,
    passShare,
    rejectedShare,
    decision,
    reasons: uniqueSorted([
      `seed-pass:${passed}/${seedAssessments.length}`,
      `seed-no-improvement:${noImprovement}/${seedAssessments.length}`,
      `seed-missing:${missing}/${seedAssessments.length}`,
      `seed-rejected:${rejected}/${seedAssessments.length}`,
      ...reasonCounts(seedAssessments),
    ]),
  };
}

function buildSurvival(
  runs: readonly ConfirmationRunSummary[],
  seedAssessments: readonly ConfirmationSeedAssessment[],
  policy: RelationalConfirmationPolicy,
): readonly ConfirmationSurvivalRecord[] {
  const groups = new Map<string, ConfirmationRunSummary[]>();
  for (const run of runs) {
    const key = stableStringify([run.cell.id, run.scenarioId]);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.entries()]
    .map(([key, group]) => survivalDecision(
      group,
      seedAssessments.filter((item) =>
        stableStringify([item.cellId, item.scenarioId]) === key
      ),
      policy,
    ))
    .sort((left, right) => compareText(left.scenarioId, right.scenarioId)
      || compareText(left.cellId, right.cellId));
}

function hypothesisDecision(
  runs: readonly ConfirmationRunSummary[],
  survival: readonly ConfirmationSurvivalRecord[],
  policy: RelationalConfirmationPolicy,
): ConfirmationHypothesisDecision {
  const first = runs[0]!;
  const records = survival.filter((item) => item.cellId === first.cell.id);
  if (first.role === "historical-baseline") {
    return {
      cellId: first.cell.id,
      role: first.role,
      hypothesisId: first.hypothesisId,
      anchorScenarioIds: [],
      scenarioCount: records.length,
      robustScenarioCount: 0,
      robustScenarioShare: 0,
      decision: "inconclusive",
      reasons: ["historical-baseline-reference"],
    };
  }
  const anchors = records.filter((item) => first.anchorScenarioIds.includes(item.scenarioId));
  const robustness = records.filter((item) => !first.anchorScenarioIds.includes(item.scenarioId));
  const robustScenarioCount = robustness.filter((item) =>
    item.decision === "survives-confirmation" || item.decision === "scenario-limited"
  ).length;
  const robustScenarioShare = robustness.length === 0
    ? 0
    : robustScenarioCount / robustness.length;
  let decision: ConfirmationDecision;
  const reasons: string[] = [];
  if (anchors.length !== first.anchorScenarioIds.length) {
    decision = "inconclusive";
    reasons.push("anchor-scenario-result-missing");
  } else if (anchors.some((item) => item.decision === "rejected")) {
    decision = "rejected";
    reasons.push("anchor-scenario-rejected");
  } else if (anchors.some((item) => item.decision === "inconclusive")) {
    decision = "inconclusive";
    reasons.push("anchor-scenario-inconclusive");
  } else if (anchors.some((item) => item.decision === "scenario-limited")) {
    decision = "scenario-limited";
    reasons.push("anchor-scenario-limited");
  } else if (robustScenarioShare >= policy.minimumRobustScenarioShare) {
    decision = "survives-confirmation";
    reasons.push("anchor-survives-and-robust-scenario-share-passes");
  } else {
    decision = "scenario-limited";
    reasons.push("anchor-survives-but-robust-scenario-share-below-threshold");
  }
  reasons.push(`robust-scenarios:${robustScenarioCount}/${robustness.length}`);
  return {
    cellId: first.cell.id,
    role: first.role,
    hypothesisId: first.hypothesisId,
    anchorScenarioIds: first.anchorScenarioIds,
    scenarioCount: records.length,
    robustScenarioCount,
    robustScenarioShare,
    decision,
    reasons: reasons.sort(compareText),
  };
}

function buildHypotheses(
  runs: readonly ConfirmationRunSummary[],
  survival: readonly ConfirmationSurvivalRecord[],
  policy: RelationalConfirmationPolicy,
): readonly ConfirmationHypothesisDecision[] {
  const groups = new Map<string, ConfirmationRunSummary[]>();
  for (const run of runs) {
    groups.set(run.cell.id, [...(groups.get(run.cell.id) ?? []), run]);
  }
  return [...groups.values()]
    .map((group) => hypothesisDecision(group, survival, policy))
    .sort((left, right) => compareText(left.hypothesisId, right.hypothesisId));
}

function validatePolicy(policy: RelationalConfirmationPolicy): void {
  const shares = [
    policy.maximumBlockingFallbackRate,
    policy.minimumSurvivingSeedShare,
    policy.minimumScenarioLimitedSeedShare,
    policy.maximumRejectedSeedShare,
    policy.minimumRobustScenarioShare,
  ];
  if (shares.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("confirmation policy rates must be between zero and one");
  }
  if (policy.minimumScenarioLimitedSeedShare > policy.minimumSurvivingSeedShare) {
    throw new RangeError("scenario-limited seed share cannot exceed surviving seed share");
  }
}

export function runRelationalConfirmation(
  inputPlan: RelationalConfirmationPlan,
  policy: RelationalConfirmationPolicy = RELATIONAL_CONFIRMATION_POLICY,
): RelationalConfirmationReport {
  validatePolicy(policy);
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
  const seedAssessments = buildSeedAssessments(runs, policy);
  const survival = buildSurvival(runs, seedAssessments, policy);
  const hypotheses = buildHypotheses(runs, survival, policy);
  const body = {
    schemaVersion: "relational-confirmation-report-v1" as const,
    planId: plan.id,
    planDigest: relationalConfirmationPlanDigest(inputPlan),
    sourceFindingsPolicyVersion: plan.sourceFindingsPolicyVersion,
    sourceReportDigest: plan.sourceReportDigest,
    sourceAnalysisDigest: plan.sourceAnalysisDigest,
    baselineCellId: plan.baselineCellId,
    policy,
    runCount: runs.length,
    roundCount: runs.reduce((sum, run) => sum + run.trajectories.length, 0),
    runs,
    seedAssessments,
    survival,
    hypotheses,
    limitations: [
      "Synthetic confirmation does not establish human learning effectiveness.",
      "Survives-confirmation means robust under this declared cohort and versioned policy only.",
      "Compact trajectories omit raw trace events while preserving objectives, outcomes, errors, failures, and fallbacks.",
      "Matched ablations are interpretable only when exactly one declared strategy axis changes.",
      "Trajectory reversal checks cover cumulative binding, transition, and confusion estimation error; other metrics remain final-aggregate evidence.",
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
