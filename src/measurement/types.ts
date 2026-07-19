import type { BindingSkillScope, PracticeMode, TimingContext, TokenId } from "../core/model.js";

export type ObservationExclusionReason =
  | "ignored-repeat"
  | "ignored-modifier"
  | "composition"
  | "unmapped"
  | "exercise-start"
  | "entry-start"
  | "non-motor-context"
  | "not-incorrect"
  | "not-correct"
  | "recovery"
  | "no-previous-token"
  | "cross-boundary";

export type TimingExclusionReason = "syllable-start" | "incorrect" | "recovery";

export type ObservationDecision<T> =
  | { readonly included: true; readonly observation: T }
  | { readonly included: false; readonly reason: ObservationExclusionReason };

export interface MeasurementPolicy {
  readonly version: string;
  readonly bindingContexts: readonly TimingContext[];
  readonly motorTimingContexts: readonly TimingContext[];
  readonly smoothingAlpha: number;
}

export interface BindingObservation {
  readonly traceSequence: number;
  readonly scope: BindingSkillScope;
  readonly context: TimingContext;
  readonly physicalCode: string;
  readonly correct: boolean;
  readonly timingMs: number | null;
  readonly timingExclusionReason: TimingExclusionReason | null;
}

export interface ConfusionSkillScope {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly expectedToken: TokenId;
  readonly actualToken: TokenId;
}

export interface ConfusionObservation {
  readonly traceSequence: number;
  readonly scope: ConfusionSkillScope;
  readonly context: TimingContext;
  readonly physicalCode: string;
}

export interface TransitionSkillScope {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly fromToken: TokenId;
  readonly toToken: TokenId;
}

export interface TransitionObservation {
  readonly traceSequence: number;
  readonly scope: TransitionSkillScope;
  readonly context: TimingContext;
  readonly timingMs: number;
}

export interface TraceMeasurementDecision {
  readonly traceSequence: number;
  readonly context: TimingContext;
  readonly binding: ObservationDecision<BindingObservation>;
  readonly confusion: ObservationDecision<ConfusionObservation>;
  readonly transition: ObservationDecision<TransitionObservation>;
}

export interface TimingExclusionCounts {
  readonly syllableStart: number;
  readonly incorrect: number;
  readonly recovery: number;
}

export interface BindingAggregate {
  readonly scope: BindingSkillScope;
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
  readonly currentTimeToTypeMs: number | null;
  readonly bestTimeToTypeMs: number | null;
  readonly timingExclusions: TimingExclusionCounts;
}

export interface ConfusionAggregate {
  readonly scope: ConfusionSkillScope;
  readonly occurrences: number;
}

export interface TransitionAggregate {
  readonly scope: TransitionSkillScope;
  readonly timingSamples: number;
  readonly currentTimeToTypeMs: number;
  readonly bestTimeToTypeMs: number;
}

export interface MeasurementSummary {
  readonly policyVersion: string;
  readonly traceCount: number;
  readonly bindingObservationCount: number;
  readonly confusionObservationCount: number;
  readonly transitionObservationCount: number;
  readonly bindings: Readonly<Record<string, BindingAggregate>>;
  readonly confusions: Readonly<Record<string, ConfusionAggregate>>;
  readonly transitions: Readonly<Record<string, TransitionAggregate>>;
}
