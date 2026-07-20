import { stableStringify } from "../../composition/stable.js";
import type {
  ConfirmationDecision,
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

export function serializeConfirmationSurvivalCsv(
  report: RelationalConfirmationReport,
): string {
  const rows: string[] = [[
    "cell_id", "scenario_id", "role", "hypothesis_id", "seed_count",
    "run_count", "decision", "reasons",
  ].join(",")];
  for (const record of report.survival) {
    rows.push([
      record.cellId,
      record.scenarioId,
      record.role,
      record.hypothesisId,
      record.seedCount,
      record.runCount,
      record.decision,
      record.reasons.join(";"),
    ].map(csvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function decisionCount(
  report: RelationalConfirmationReport,
  decision: ConfirmationDecision,
): number {
  return report.survival.filter((item) => item.decision === decision).length;
}

function candidateLines(report: RelationalConfirmationReport): string[] {
  const candidates = report.survival.filter((item) =>
    item.role === "phase-7g-candidate"
  );
  return candidates.map((item) =>
    `| ${item.scenarioId} | \`${item.hypothesisId}\` | ${item.decision} | ${item.reasons.join("; ")} |`
  );
}

function hypothesisLines(report: RelationalConfirmationReport): string[] {
  const ids = [...new Set(report.survival.map((item) => item.hypothesisId))].sort();
  return ids.map((hypothesisId) => {
    const records = report.survival.filter((item) => item.hypothesisId === hypothesisId);
    const count = (decision: ConfirmationDecision) =>
      records.filter((item) => item.decision === decision).length;
    return `| \`${hypothesisId}\` | ${records.length} | ${count("survives-confirmation")} | ${count("scenario-limited")} | ${count("inconclusive")} | ${count("rejected")} |`;
  });
}

export function serializeRelationalConfirmationMarkdown(
  report: RelationalConfirmationReport,
): string {
  const lines = [
    "# Relational strategy confirmation",
    "",
    `- Plan: \`${report.planId}\``,
    `- Plan digest: \`${report.planDigest}\``,
    `- Source findings policy: \`${report.sourceFindingsPolicyVersion}\``,
    `- Baseline cell: \`${report.baselineCellId}\``,
    `- Report digest: \`${report.determinismDigest}\``,
    `- Runs: ${report.runCount}`,
    `- Adaptive rounds: ${report.roundCount}`,
    "",
    "## Decision counts",
    "",
    `- Survives confirmation: ${decisionCount(report, "survives-confirmation")}`,
    `- Scenario limited: ${decisionCount(report, "scenario-limited")}`,
    `- Inconclusive: ${decisionCount(report, "inconclusive")}`,
    `- Rejected: ${decisionCount(report, "rejected")}`,
    "",
    "## Phase 7G candidate survival",
    "",
    "| Scenario | Candidate hypothesis | Decision | Reasons |",
    "|---|---|---|---|",
    ...candidateLines(report),
    "",
    "## Hypothesis overview",
    "",
    "| Hypothesis | Scenario count | Survives | Limited | Inconclusive | Rejected |",
    "|---|---:|---:|---:|---:|---:|",
    ...hypothesisLines(report),
    "",
    "## Interpretation boundary",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    "",
    "## Selected final metrics",
    "",
    "The machine-readable JSON and CSV artifacts retain every seed and per-round trajectory. This document intentionally summarizes decisions rather than ranking cells with one score.",
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
