import type { InputLayout, TokenId } from "../core/model.js";
import type { FrequencyFirstUtterancePolicy } from "../curriculum/frequency-first-utterance.js";
import type {
  CatalogSupportIndex,
  CurriculumProfile,
} from "../curriculum/types.js";
import { bindingScopeKey } from "../measurement/aggregate.js";
import type {
  BindingAggregate,
  MeasurementSummary,
} from "../measurement/types.js";
import {
  physicalKeyLabel,
  reinforcementStateLabel,
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
  DiagnosticReinforcementState,
  KeyDiagnostic,
  TransitionDiagnostic,
} from "./types.js";

export interface BuildDiagnosticModelInput {
  readonly measurements: MeasurementSummary;
  readonly curriculum: CurriculumProfile;
  readonly support: CatalogSupportIndex;
  readonly layout: InputLayout;
  readonly selectionPolicy: FrequencyFirstUtterancePolicy;
}

interface SelectionInfluence {
  readonly state: DiagnosticReinforcementState;
  readonly label: string;
  readonly reason: string;
  readonly expectedTokenBoost: number;
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function reverseLayout(layout: InputLayout): ReadonlyMap<TokenId, string> {
  const result = new Map<TokenId, string>();
  for (const [code, tokenId] of Object.entries(layout.bindings)) {
    if (!result.has(tokenId)) result.set(tokenId, code);
  }
  return result;
}

function selectionInfluence(
  aggregate: BindingAggregate | undefined,
  timingAvailable: boolean,
  policy: FrequencyFirstUtterancePolicy,
): SelectionInfluence {
  const attempts = aggregate?.attempts ?? 0;
  const errors = aggregate?.errors ?? 0;
  const timingSamples = aggregate?.timingSamples ?? 0;
  const errorEligible = attempts >= policy.minimumBindingAttempts;
  const timingEligible = timingAvailable
    && timingSamples >= policy.minimumBindingTimingSamples
    && aggregate?.currentTimeToTypeMs !== null
    && aggregate?.currentTimeToTypeMs !== undefined
    && aggregate.bestTimeToTypeMs !== null
    && aggregate.bestTimeToTypeMs > 0;
  const errorRate = errorEligible ? errors / attempts : null;
  const timingRatio = timingEligible
    ? aggregate.currentTimeToTypeMs / aggregate.bestTimeToTypeMs
    : null;
  const errorSignal = errorRate !== null && errorRate > 0;
  const timingSignal = timingRatio !== null && timingRatio > 1;
  const errorContribution = errorRate === null ? 0 : errorRate * policy.errorBoostScale;
  const timingContribution = timingRatio === null
    ? 0
    : Math.max(0, timingRatio - 1) * policy.timingBoostScale;
  const expectedTokenBoost = clamp(
    1 + errorContribution + timingContribution,
    1,
    policy.maximumExpectedTokenBoost,
  );

  let state: DiagnosticReinforcementState;
  let reason: string;
  if (expectedTokenBoost > 1) {
    state = "reinforced";
    reason = errorContribution > 0 && timingContribution > 0
      ? "錯誤觀察與有效鍵間時間"
      : errorContribution > 0
        ? "錯誤觀察較多"
        : "有效鍵間時間較長";
  } else if (!errorEligible && !timingEligible) {
    state = "sampling";
    if (!timingAvailable) {
      reason = "錯誤觀察樣本仍不足";
    } else if (attempts < policy.minimumBindingAttempts
      && timingSamples < policy.minimumBindingTimingSamples) {
      reason = "錯誤與時間樣本仍不足";
    } else if (attempts < policy.minimumBindingAttempts) {
      reason = "錯誤觀察樣本仍不足";
    } else {
      reason = "有效鍵間時間樣本仍不足";
    }
  } else {
    state = "neutral";
    reason = (errorSignal || timingSignal)
      ? "已有弱點觀察，但相關選題權重目前為 0%"
      : "目前觀察未產生額外加權";
  }

  return {
    state,
    label: reinforcementStateLabel(state),
    reason,
    expectedTokenBoost,
  };
}

export function buildDiagnosticModel(
  input: BuildDiagnosticModelInput,
): DiagnosticModel {
  const codeByToken = reverseLayout(input.layout);
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
    const timingAvailable = (input.support.byToken[tokenId]?.motorEntryCount ?? 0) > 0;
    const timingAvailability = timingAvailable ? "available" : "not-applicable";
    const timingDataState = timingAvailable
      ? dataStateForSamples(timingSamples, DIAGNOSTIC_POLICY.timingSamples)
      : null;
    const overallDataState = timingDataState === null
      ? errorDataState
      : conservativeDataState(errorDataState, timingDataState);

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
      reinforcement: selectionInfluence(
        aggregate,
        timingAvailable,
        input.selectionPolicy,
      ),
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
