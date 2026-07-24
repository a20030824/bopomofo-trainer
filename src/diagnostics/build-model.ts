import type { InputLayout, TokenId } from "../core/model.js";
import { classifyBindingStates } from "../curriculum/state.js";
import type {
  CatalogSupportIndex,
  CurriculumPolicy,
  CurriculumProfile,
} from "../curriculum/types.js";
import { bindingScopeKey } from "../measurement/aggregate.js";
import type { MeasurementSummary } from "../measurement/types.js";
import {
  curriculumReasonLabel,
  curriculumStateLabel,
  physicalKeyLabel,
  tokenLabel,
} from "./labels.js";
import {
  conservativeDataState,
  dataStateForSamples,
  DIAGNOSTIC_POLICY,
} from "./policy.js";
import type {
  ConfusionDiagnostic,
  DiagnosticModel,
  KeyDiagnostic,
  TransitionDiagnostic,
} from "./types.js";

export interface BuildDiagnosticModelInput {
  readonly measurements: MeasurementSummary;
  readonly curriculum: CurriculumProfile;
  readonly curriculumPolicy: CurriculumPolicy;
  readonly support: CatalogSupportIndex;
  readonly layout: InputLayout;
  readonly focusedTokenId: TokenId | null;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function reverseLayout(layout: InputLayout): ReadonlyMap<TokenId, string> {
  const result = new Map<TokenId, string>();
  for (const [code, tokenId] of Object.entries(layout.bindings)) {
    if (!result.has(tokenId)) result.set(tokenId, code);
  }
  return result;
}

export function buildDiagnosticModel(
  input: BuildDiagnosticModelInput,
): DiagnosticModel {
  const codeByToken = reverseLayout(input.layout);
  const bindingStates = classifyBindingStates(
    input.curriculum,
    input.support,
    input.curriculumPolicy,
    input.focusedTokenId,
  );
  const stateByToken = new Map(bindingStates.map((decision) => [decision.tokenId, decision]));

  const tokenIds = [...codeByToken.keys()]
    .filter((tokenId) => input.support.byToken[tokenId] !== undefined)
    .sort(codeUnitCompare);

  const keys: KeyDiagnostic[] = tokenIds.map((tokenId) => {
    const physicalCode = codeByToken.get(tokenId) ?? "";
    const aggregate = input.measurements.bindings[bindingScopeKey({
      mode: input.curriculum.mode,
      layoutId: input.curriculum.layoutId,
      tokenId,
    })];
    const attempts = aggregate?.attempts ?? 0;
    const errors = aggregate?.errors ?? 0;
    const timingSamples = aggregate?.timingSamples ?? 0;
    const errorDataState = dataStateForSamples(attempts, DIAGNOSTIC_POLICY.errorSamples);
    const stateDecision = stateByToken.get(tokenId);
    const timingAvailability = stateDecision?.evidence === "timed"
      ? "available"
      : "not-applicable";
    const timingDataState = timingAvailability === "available"
      ? dataStateForSamples(timingSamples, DIAGNOSTIC_POLICY.timingSamples)
      : null;
    const overallDataState = timingDataState === null
      ? errorDataState
      : conservativeDataState(errorDataState, timingDataState);
    const reinforcementState = stateDecision?.state ?? "unobserved";
    const reinforcementReason = stateDecision?.reason ?? "no-binding-observations";

    return {
      tokenId,
      symbol: tokenLabel(tokenId),
      physicalCode,
      physicalKey: physicalKeyLabel(physicalCode),
      attempts,
      errors,
      displayedErrorRatio: attempts === 0 ? null : errors / attempts,
      errorMetricLabel: "錯誤觀察比例",
      errorDataState,
      timingAvailability,
      timingMs: aggregate?.currentTimeToTypeMs ?? null,
      timingSamples,
      bestTimingMs: aggregate?.bestTimeToTypeMs ?? null,
      timingDataState,
      excludedSamples: aggregate?.timingExclusions ?? {
        syllableStart: 0,
        incorrect: 0,
        recovery: 0,
        interactionNoise: 0,
      },
      overallDataState,
      reinforcement: {
        state: reinforcementState,
        label: curriculumStateLabel(reinforcementState),
        reason: curriculumReasonLabel(reinforcementReason),
      },
    };
  });

  const transitions: TransitionDiagnostic[] = Object.values(input.measurements.transitions)
    .map((aggregate) => {
      const fromCode = codeByToken.get(aggregate.scope.fromToken) ?? "";
      const toCode = codeByToken.get(aggregate.scope.toToken) ?? "";
      return {
        id: `transition:${aggregate.scope.fromToken}->${aggregate.scope.toToken}`,
        fromTokenId: aggregate.scope.fromToken,
        toTokenId: aggregate.scope.toToken,
        fromSymbol: tokenLabel(aggregate.scope.fromToken),
        toSymbol: tokenLabel(aggregate.scope.toToken),
        fromPhysicalKey: physicalKeyLabel(fromCode),
        toPhysicalKey: physicalKeyLabel(toCode),
        timingMs: aggregate.currentTimeToTypeMs,
        bestTimingMs: aggregate.bestTimeToTypeMs,
        timingSamples: aggregate.timingSamples,
        dataState: dataStateForSamples(
          aggregate.timingSamples,
          DIAGNOSTIC_POLICY.relationshipSamples,
        ),
        includesTone: aggregate.scope.fromToken.startsWith("tone:")
          || aggregate.scope.toToken.startsWith("tone:"),
      };
    })
    .sort((left, right) => codeUnitCompare(left.id, right.id));

  const confusionTotals = new Map<TokenId, number>();
  for (const aggregate of Object.values(input.measurements.confusions)) {
    confusionTotals.set(
      aggregate.scope.expectedToken,
      (confusionTotals.get(aggregate.scope.expectedToken) ?? 0) + aggregate.occurrences,
    );
  }
  const confusions: ConfusionDiagnostic[] = Object.values(input.measurements.confusions)
    .map((aggregate) => {
      const expectedTotal = confusionTotals.get(aggregate.scope.expectedToken) ?? 0;
      const expectedCode = codeByToken.get(aggregate.scope.expectedToken) ?? "";
      const actualCode = codeByToken.get(aggregate.scope.actualToken) ?? "";
      return {
        id: `confusion:${aggregate.scope.expectedToken}->${aggregate.scope.actualToken}`,
        expectedTokenId: aggregate.scope.expectedToken,
        actualTokenId: aggregate.scope.actualToken,
        expectedSymbol: tokenLabel(aggregate.scope.expectedToken),
        actualSymbol: tokenLabel(aggregate.scope.actualToken),
        expectedPhysicalKey: physicalKeyLabel(expectedCode),
        actualPhysicalKey: physicalKeyLabel(actualCode),
        occurrences: aggregate.occurrences,
        expectedConfusionTotal: expectedTotal,
        expectedErrorShare: expectedTotal === 0 ? 0 : aggregate.occurrences / expectedTotal,
        dataState: dataStateForSamples(
          aggregate.occurrences,
          DIAGNOSTIC_POLICY.relationshipSamples,
        ),
      };
    })
    .sort((left, right) => codeUnitCompare(left.id, right.id));

  return {
    summary: {
      keysWithData: keys.filter((key) => key.attempts > 0).length,
      repeatedConfusions: confusions.filter((row) =>
        row.occurrences >= DIAGNOSTIC_POLICY.commonConfusionOccurrences
      ).length,
      slowerTransitions: transitions.filter((row) =>
        row.timingSamples >= DIAGNOSTIC_POLICY.relationshipSamples.sufficient
        && row.timingMs >= DIAGNOSTIC_POLICY.transitionTimingBandsMs.slow
      ).length,
    },
    keys,
    transitions,
    confusions,
  };
}
