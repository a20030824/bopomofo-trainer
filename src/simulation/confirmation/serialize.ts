import { stableStringify } from "../../composition/stable.js";
import type {
  ConfirmationDecision,
  ConfirmationSeedDecision,
  RelationalConfirmationReport,
} from "./types.js";

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  const escaped = text.split('"').join('""');
  return text.includes(",") || text.includes("\n") || text.includes('"')
    ? `"${escaped}"`
    : text;
}

function number(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

export function serializeRelationalConfirmationJson(
  report: RelationalConfirmationReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeConfirmationTrajectoriesCsv(
  report: RelationalConfirmationReport,
): string {
  const rows: string[] = [[
    "cell_id", "role", "hypothesis_id", "matched_reference_cell_id",
    "scenario_id", "seed", "round", "objective_relation_keys",
    "selected_entry_ids", "token_count", "syllable_count", "stop_reason",
    "total_fallback_codes", "blocking_fallback_codes", "failure_codes",
    "hidden_weakness_hit", "binding_error", "transition_error_ms", "confusion_error",
  ].join(",")];
  for (const run of report.runs) {
    for (const trajectory of run.trajectories) {
      rows.push([
        run.cell.id,
        run.role,
        run.hypothesisId,
        run.matchedReferenceCellId,
        run.scenarioId,
        run.seed,
        trajectory.round,
        trajectory.objectiveRelationKeys.join(";"),
        trajectory.selectedEntryIds.join(";"),
        trajectory.tokenCount,
        trajectory.syllableCount,
        trajectory.stopReason,
        trajectory.totalFallbackCodes.join(";"),
        trajectory.blockingFallbackCodes.join(";"),
        trajectory.failureCodes.join(";"),
        trajectory.hiddenWeaknessHit,
        trajectory.bindingEstimateMeanAbsoluteError,
        trajectory.transitionEstimateMeanAbsoluteErrorMs,
        trajectory.confusionEstimateMeanAbsoluteError,
      ].map(csvCell).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

export function serializeConfirmationSeedAssessmentsCsv(
  report: RelationalConfirmationReport,
): string {
  const rows: string[] = [[
    "cell_id", "scenario_id", "seed", "role", "hypothesis_id",
    "matched_reference_cell_id", "decision", "reasons",
    "trajectory_reversals", "unsustained_trajectory_improvements",
  ].join(",")];
  for (const record of report.seedAssessments) {
    rows.push([
      record.cellId,
      record.scenarioId,
      record.seed,
      record.role,
      record.hypothesisId,
      record.matchedReferenceCellId,
      record.decision,
      record.reasons.join(";"),
      record.trajectoryReversals.join(";"),
      record.unsustainedTrajectoryImprovements.join(";"),
    ].map(csvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

export function serializeConfirmationSurvivalCsv(
  report: RelationalConfirmationReport,
): string {
  const rows: string[] = [[
    "cell_id", "scenario_id", "role", "hypothesis_id", "anchor_scenario",
    "seed_count", "run_count", "pass_count", "no_improvement_count",
    "missing_evidence_count", "rejected_count", "pass_share", "rejected_share",
    "decision", "reasons",
  ].join(",")];
  for (const record of report.survival) {
    rows.push([
      record.cellId,
      record.scenarioId,
      record.role,
      record.hypothesisId,
      record.anchorScenario,
      record.seedCount,
      record.runCount,
      record.passCount,
      record.noImprovementCount,
      record.missingEvidenceCount,
      record.rejectedCount,
      record.passShare,
      record.rejectedShare,
      record.decision,
      record.reasons.join(";"),
    ].map(csvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function scenarioDecisionCount(
  report: RelationalConfirmationReport,
  decision: ConfirmationDecision,
): number {
  return report.survival.filter((item) => item.decision === decision).length;
}

function seedDecisionCount(
  report: RelationalConfirmationReport,
  decision: ConfirmationSeedDecision,
): number {
  return report.seedAssessments.filter((item) => item.decision === decision).length;
}

function candidateScenarioLines(report: RelationalConfirmationReport): string[] {
  return report.survival
    .filter((item) => item.role === "phase-7g-candidate")
    .map((item) =>
      `| ${item.scenarioId} | \`${item.hypothesisId}\` | ${item.anchorScenario ? "yes" : "no"}`
      + ` | ${item.passCount}/${item.seedCount} | ${item.rejectedCount}/${item.seedCount}`
      + ` | ${item.decision} |`
    );
}

function hypothesisLines(report: RelationalConfirmationReport): string[] {
  return report.hypotheses.map((item) =>
    `| \`${item.hypothesisId}\` | ${item.anchorScenarioIds.join(", ") || "—"}`
    + ` | ${item.robustScenarioCount}/${Math.max(0, item.scenarioCount - item.anchorScenarioIds.length)}`
    + ` | ${item.decision} | ${item.reasons.join("; ")} |`
  );
}

function reversalLines(report: RelationalConfirmationReport): string[] {
  const reversals = report.seedAssessments.filter((item) =>
    item.trajectoryReversals.length > 0
  );
  if (reversals.length === 0) return ["No material trajectory reversal was recorded."];
  const counts = new Map<string, number>();
  for (const reversal of reversals.flatMap((item) => item.trajectoryReversals)) {
    counts.set(reversal, (counts.get(reversal) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([reason, count]) => `- \`${reason}\` — ${count} seed/scenario assessments.`);
}

export function serializeRelationalConfirmationMarkdown(
  report: RelationalConfirmationReport,
): string {
  const lines = [
    "# Relational strategy confirmation",
    "",
    `- Plan: \`${report.planId}\``,
    `- Plan digest: \`${report.planDigest}\``,
    `- Source report digest: \`${report.sourceReportDigest}\``,
    `- Source analysis digest: \`${report.sourceAnalysisDigest}\``,
    `- Source findings policy: \`${report.sourceFindingsPolicyVersion}\``,
    `- Confirmation policy: \`${report.policy.version}\``,
    `- Baseline cell: \`${report.baselineCellId}\``,
    `- Report digest: \`${report.determinismDigest}\``,
    `- Runs: ${report.runCount}`,
    `- Adaptive rounds: ${report.roundCount}`,
    "",
    "## Scenario decision counts",
    "",
    `- Survives confirmation: ${scenarioDecisionCount(report, "survives-confirmation")}`,
    `- Scenario limited: ${scenarioDecisionCount(report, "scenario-limited")}`,
    `- Inconclusive: ${scenarioDecisionCount(report, "inconclusive")}`,
    `- Rejected: ${scenarioDecisionCount(report, "rejected")}`,
    "",
    "## Seed assessment counts",
    "",
    `- Pass: ${seedDecisionCount(report, "pass")}`,
    `- No material improvement: ${seedDecisionCount(report, "no-improvement")}`,
    `- Missing evidence: ${seedDecisionCount(report, "missing-evidence")}`,
    `- Rejected: ${seedDecisionCount(report, "rejected")}`,
    "",
    "## Phase 7G candidate survival by scenario",
    "",
    "| Scenario | Candidate hypothesis | Anchor | Passing seeds | Rejected seeds | Decision |",
    "|---|---|---|---:|---:|---|",
    ...candidateScenarioLines(report),
    "",
    "## Hypothesis decisions",
    "",
    "| Hypothesis | Anchor scenarios | Robust scenarios | Decision | Reasons |",
    "|---|---|---:|---|---|",
    ...hypothesisLines(report),
    "",
    "## Material trajectory reversals",
    "",
    ...reversalLines(report),
    "",
    "## Interpretation boundary",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    "",
    "## Machine-readable evidence",
    "",
    "The JSON, seed-assessment CSV, survival CSV, and trajectory CSV retain every seed and adaptive round. This document intentionally summarizes decisions rather than ranking cells with one score.",
  ];
  return `${lines.join("\n")}\n`;
}

export function confirmationMetricSummary(
  report: RelationalConfirmationReport,
): readonly string[] {
  return report.runs.map((run) =>
    `${run.hypothesisId}:${run.scenarioId}:${run.seed}:`
    + `binding=${number(run.finalMetrics.bindingEstimateMeanAbsoluteError.value)},`
    + `transition=${number(run.finalMetrics.transitionEstimateMeanAbsoluteErrorMs.value)},`
    + `confusion=${number(run.finalMetrics.confusionEstimateMeanAbsoluteError.value)}`
  );
}
