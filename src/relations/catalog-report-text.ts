import type {
  RelationRef,
  RelationSupportSummary,
} from "./types.js";
import type { RelationalCatalogReport } from "./catalog-report.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function tokenLabel(tokenId: string): string {
  if (tokenId.startsWith("zhuyin:")) return tokenId.slice("zhuyin:".length);
  if (tokenId === "tone:1") return "一聲";
  if (tokenId === "tone:2") return "二聲";
  if (tokenId === "tone:3") return "三聲";
  if (tokenId === "tone:4") return "四聲";
  if (tokenId === "tone:5") return "輕聲";
  return tokenId;
}

export function relationLabel(relation: RelationRef): string {
  if (relation.kind === "binding") return tokenLabel(relation.scope.tokenId);
  if (relation.kind === "transition") {
    return `${tokenLabel(relation.scope.fromToken)} → ${tokenLabel(relation.scope.toToken)}`;
  }
  return `${tokenLabel(relation.scope.expectedToken)} ⇢ ${tokenLabel(relation.scope.actualToken)}`;
}

function relationLines(
  summaries: readonly RelationSupportSummary[],
  maximum = 20,
): string[] {
  return summaries.slice(0, maximum).map((summary) =>
    `  ${relationLabel(summary.relation)} | training ${summary.trainingOccurrenceCount} 次 / ${summary.trainingDistinctEntryCount} 詞 | 集中度 ${summary.trainingEntryConcentration.toFixed(2)}`,
  );
}

export function formatRelationalCatalogReport(
  report: RelationalCatalogReport,
): string {
  const support = Object.values(report.index.support);
  const losses = support
    .filter((summary) => summary.supportState === "evaluation-only")
    .sort((left, right) => compareText(
      relationLabel(left.relation),
      relationLabel(right.relation),
    ));
  const concentrated = support
    .filter((summary) => summary.supportState === "concentrated")
    .sort((left, right) =>
      right.trainingEntryConcentration - left.trainingEntryConcentration
      || left.trainingDistinctEntryCount - right.trainingDistinctEntryCount
      || compareText(relationLabel(left.relation), relationLabel(right.relation)),
    );
  const rareOnly = support
    .filter((summary) => summary.supportState === "rare-only")
    .sort((left, right) => compareText(
      relationLabel(left.relation),
      relationLabel(right.relation),
    ));

  const lines = [
    "Relational catalog analysis",
    `schema: ${report.schemaVersion}`,
    `scope: ${report.mode} / ${report.layoutId}`,
    `analyzed: ${report.analyzedRelationKinds.join(", ")}`,
    `digest: ${report.determinismDigest}`,
    "",
    `entries: ${report.totals.entries} (${report.totals.trainingEntries} training / ${report.totals.evaluationEntries} evaluation)`,
    `syllables: ${report.totals.syllables}`,
    `binding occurrences: ${report.totals.tokenOccurrences}`,
    `transition occurrences: ${report.totals.transitionOccurrences}`,
    `binding relations: ${report.totals.observedBindingRelations}/${report.totals.bindingRelations} observed`,
    `transition relations: ${report.totals.observedTransitionRelations}/${report.totals.transitionRelations} observed`,
    "",
    `binding states: ${JSON.stringify(report.stateCounts.binding)}`,
    `transition states: ${JSON.stringify(report.stateCounts.transition)}`,
    "",
    `evaluation-only support losses: ${losses.length}`,
    ...relationLines(losses),
    "",
    `rare-only training relations: ${rareOnly.length}`,
    ...relationLines(rareOnly),
    "",
    `concentrated training relations: ${concentrated.length}`,
    ...relationLines(concentrated),
    "",
    `unsupported bindings: ${report.unsupportedBindingKeys.length}`,
    `unsupported grammar-supported transitions: ${report.unsupportedTransitionKeys.length}`,
  ];

  return `${lines.join("\n")}\n`;
}
