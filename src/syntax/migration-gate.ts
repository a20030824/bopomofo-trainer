import type { SyntaxCoverageReport } from "./coverage.js";

export interface FixedTemplateRemovalEvidence {
  readonly coverage: SyntaxCoverageReport;
  readonly syntaxEvidenceSchemaVersion: string;
  readonly legacyCandidateParityPassed: boolean;
  readonly browserSessionMigrationPassed: boolean;
  readonly progressMigrationPassed: boolean;
  readonly heldOutIsolationPassed: boolean;
  readonly formalRuntimeDefaultEnabled: boolean;
}

export interface FixedTemplateRemovalDecision {
  readonly removalAllowed: boolean;
  readonly blockingReasons: readonly string[];
}

export function evaluateFixedTemplateRemovalGate(
  evidence: FixedTemplateRemovalEvidence,
): FixedTemplateRemovalDecision {
  const blockingReasons: string[] = [];
  if (evidence.syntaxEvidenceSchemaVersion !== "ud-syntax-evidence-v2") {
    blockingReasons.push("syntax-evidence-v2-not-active");
  }
  if (evidence.coverage.uposCoverage.missingLexicalPositions.length > 0) {
    blockingReasons.push("upos-lexical-position-coverage-incomplete");
  }
  if (evidence.coverage.unrealizableProfileCount > 0) {
    blockingReasons.push("unrealizable-syntax-profiles-remain");
  }
  if (evidence.coverage.productionRuleCoverage.missingPositiveFixtureRuleIds.length > 0
    || evidence.coverage.productionRuleCoverage.missingNegativeFixtureRuleIds.length > 0) {
    blockingReasons.push("production-rule-fixture-coverage-incomplete");
  }
  if (evidence.coverage.derivationShapeCountByBound.length === 0
    || evidence.coverage.derivationShapeCountByBound.some((record) => !record.complete)) {
    blockingReasons.push("bounded-derivation-shape-count-incomplete");
  }
  if (!evidence.legacyCandidateParityPassed) blockingReasons.push("legacy-candidate-parity-not-passed");
  if (!evidence.browserSessionMigrationPassed) blockingReasons.push("browser-session-migration-not-passed");
  if (!evidence.progressMigrationPassed) blockingReasons.push("progress-migration-not-passed");
  if (!evidence.heldOutIsolationPassed) blockingReasons.push("held-out-isolation-not-passed");
  if (!evidence.formalRuntimeDefaultEnabled) blockingReasons.push("formal-runtime-not-default");
  return {
    removalAllowed: blockingReasons.length === 0,
    blockingReasons,
  };
}
