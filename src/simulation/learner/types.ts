import type { Exercise, InputLayout, TokenId } from "../../core/model.js";
import type { MeasurementPolicy, MeasurementSummary, TraceMeasurementDecision } from "../../measurement/types.js";
import type { InteractionTrace } from "../../practice/interaction-session.js";

export interface LogNormalLatencyTruth {
  readonly meanMs: number;
  readonly standardDeviationMs: number;
}

export interface BindingTruth {
  readonly tokenId: TokenId;
  readonly errorProbability: number;
  readonly fallbackActualToken: TokenId;
  readonly boundaryResponseAdjustmentMs: number;
  readonly learningRate: number;
  readonly decayRatePerStep: number;
}

export interface TransitionTransferTruth {
  readonly targetTransitionKey: string;
  readonly factor: number;
}

export interface TransitionTruth {
  readonly fromToken: TokenId;
  readonly toToken: TokenId;
  readonly latency: LogNormalLatencyTruth;
  readonly learningRate: number;
  readonly decayRatePerStep: number;
  readonly transfer: readonly TransitionTransferTruth[];
}

export interface ConfusionTruth {
  readonly expectedToken: TokenId;
  readonly actualToken: TokenId;
  readonly conditionalProbability: number;
  readonly learningRate: number;
  readonly decayRatePerStep: number;
}

export interface ContextNoiseTruth {
  readonly exerciseStartLatency: LogNormalLatencyTruth;
  readonly entryStartLatency: LogNormalLatencyTruth;
  readonly syllableStartLatency: LogNormalLatencyTruth;
  readonly defaultTransitionLatency: LogNormalLatencyTruth;
  readonly recoveryDelay: LogNormalLatencyTruth;
  readonly unmappedNoiseProbability: number;
  readonly heldRepeatProbability: number;
  readonly compositionInterruptionProbability: number;
  readonly sessionLatencyScaleStandardDeviation: number;
  readonly observationLatencyScaleStandardDeviation: number;
}

export interface SyntheticLearnerState {
  readonly version: "synthetic-relational-v1";
  readonly sessionIndex: number;
  readonly bindings: Readonly<Record<string, BindingTruth>>;
  readonly transitions: Readonly<Record<string, TransitionTruth>>;
  readonly confusions: Readonly<Record<string, ConfusionTruth>>;
  readonly context: ContextNoiseTruth;
}

export interface LatentTruthSnapshot {
  readonly phase: "before" | "after";
  readonly state: SyntheticLearnerState;
  readonly orderingReason: "code-unit-sorted-relation-keys";
}

export type GenerationTimingReason =
  | "exercise-boundary-truth"
  | "entry-boundary-truth"
  | "syllable-boundary-truth"
  | "directional-transition-truth"
  | "default-transition-fallback";

export type GenerationNoiseReason =
  | "no-interaction-noise"
  | "unmapped-interaction-noise"
  | "held-repeat-interaction-noise"
  | "composition-interruption-noise";

export type GenerationResponseReason =
  | "binding-correct"
  | "named-directional-confusion"
  | "generic-binding-error-fallback";

export interface SyntheticGenerationDecision {
  readonly targetPosition: number;
  readonly expectedToken: TokenId;
  readonly context: string;
  readonly transitionKey: string | null;
  readonly plannedLatencyMs: number;
  readonly timingReason: GenerationTimingReason;
  readonly noiseReason: GenerationNoiseReason;
  readonly responseReason: GenerationResponseReason;
  readonly actualToken: TokenId;
  readonly recovered: boolean;
  readonly traceSequences: readonly number[];
  readonly physicalCodeSelectionReason: "lexicographically-first-layout-code";
}

export type ExposureReason =
  | "semantic-binding-exposure"
  | "named-confusion-exposure"
  | "clean-transition-exposure"
  | "recovered-transition-partial-credit"
  | "explicit-transition-transfer"
  | "binding-retention-decay"
  | "transition-retention-decay"
  | "confusion-retention-decay"
  | "confusion-decay-probability-cap";

export interface ExposureEvent {
  readonly relationKind: "binding" | "transition" | "confusion";
  readonly relationKey: string;
  readonly before: number;
  readonly after: number;
  readonly credit: number;
  readonly reason: ExposureReason;
}

export interface ExposureSkip {
  readonly relationKind: "transition";
  readonly relationKey: string;
  readonly reason: "undeclared-transition-fallback-has-no-latent-update";
}

export interface ExposureUpdate {
  readonly events: readonly ExposureEvent[];
  readonly skipped: readonly ExposureSkip[];
  readonly retentionSteps: number;
  readonly updateOrderReason: "semantic-target-order-then-explicit-transfer-then-decay";
}

export interface ScalarEstimate {
  readonly relationKey: string;
  readonly samples: number;
  readonly value: number;
  readonly reason:
    | "binding-error-rate-from-phase-3-observations"
    | "conditional-confusion-rate-from-phase-3-observations"
    | "transition-mean-from-phase-3-observations"
    | "clean-boundary-mean-from-raw-traces";
}

export interface MeasurementEstimate {
  readonly aggregate: MeasurementSummary;
  readonly decisions: readonly TraceMeasurementDecision[];
  readonly bindingErrorRates: Readonly<Record<string, ScalarEstimate>>;
  readonly conditionalConfusionRates: Readonly<Record<string, ScalarEstimate>>;
  readonly transitionMeanLatencies: Readonly<Record<string, ScalarEstimate>>;
  readonly boundaryMeanLatencies: Readonly<Record<string, ScalarEstimate>>;
  readonly orderingReason: "code-unit-sorted-estimate-keys";
}

export interface EstimationErrorComponent {
  readonly relationKind: "binding" | "transition" | "confusion";
  readonly relationKey: string;
  readonly status: "estimated" | "insufficient-samples";
  readonly latentValue: number;
  readonly estimatedValue: number | null;
  readonly absoluteError: number | null;
  readonly relativeError: number | null;
  readonly reason: "estimate-available" | "no-eligible-phase-3-observation";
}

export interface EstimationErrorReport {
  readonly components: readonly EstimationErrorComponent[];
  readonly meanAbsoluteErrorByKind: Readonly<Record<string, number | null>>;
  readonly comparisonTruthReason: "traces-generated-from-before-exposure-truth";
}

export interface DeterminismDigest {
  readonly algorithm: "fnv1a32";
  readonly value: string;
  readonly canonicalizationReason: "recursive-code-unit-key-order";
}

export interface SyntheticTraceBatch {
  readonly scenarioId: string;
  readonly seed: number;
  readonly exercise: Exercise;
  readonly layoutId: string;
  readonly startedAtMs: number;
  readonly traces: readonly InteractionTrace[];
  readonly generationDecisions: readonly SyntheticGenerationDecision[];
  readonly stopReason: "sequence-complete" | "empty-sequence";
  readonly beforeTruth: LatentTruthSnapshot;
  readonly afterTruth: LatentTruthSnapshot;
  readonly exposureUpdate: ExposureUpdate;
  readonly measurementEstimate: MeasurementEstimate;
  readonly estimationErrorReport: EstimationErrorReport;
  readonly determinismDigest: DeterminismDigest;
  readonly orderingReason: "semantic-target-order";
}

export interface SyntheticScenario {
  readonly id:
    | "weak-binding"
    | "weak-transition"
    | "asymmetric-confusion"
    | "competing-weaknesses"
    | "high-noise"
    | "fast-inaccurate"
    | "slow-accurate"
    | "zero-learning"
    | "retention-decay"
    | "heterogeneous-improvement";
  readonly description: string;
  readonly seed: number;
  readonly startedAtMs: number;
  readonly retentionSteps: number;
  readonly exercise: Exercise;
  readonly layout: InputLayout;
  readonly measurementPolicy: MeasurementPolicy;
  readonly learner: SyntheticLearnerState;
}
