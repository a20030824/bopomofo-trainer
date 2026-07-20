import type { PracticeMode, TokenId } from "../core/model.js";
import type {
  CompositionStrategyId,
  PracticeSequence,
} from "../composition/types.js";
import type { ObjectiveStrategyId } from "../curriculum/objectives.js";

export interface ProbabilityLatent {
  readonly initial: number;
  readonly floor: number;
  readonly learningRate: number;
}

export interface LatencyLatent {
  readonly meanMs: number;
  readonly standardDeviationMs: number;
  readonly floorMs: number;
  readonly learningRate: number;
}

export interface BindingLatent {
  readonly error: ProbabilityLatent;
}

export interface ConfusionLatent {
  readonly probability: ProbabilityLatent;
}

export interface TransitionLatent {
  readonly latency: LatencyLatent;
  readonly conditionedErrorMultiplier: number;
}

export interface BoundaryLatent {
  readonly exerciseStart: LatencyLatent;
  readonly entryStart: LatencyLatent;
  readonly syllableStart: LatencyLatent;
}

export interface NoiseLatent {
  readonly unmappedProbability: number;
  readonly repeatProbability: number;
  readonly compositionProbability: number;
  readonly recoveryDelayMs: number;
  readonly sessionSpeedDrift: number;
}

export interface SyntheticLearnerTruth {
  readonly id: string;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly binding: Readonly<Record<TokenId, BindingLatent>>;
  readonly confusion: Readonly<Record<string, ConfusionLatent>>;
  readonly transition: Readonly<Record<string, TransitionLatent>>;
  readonly boundary: BoundaryLatent;
  readonly noise: NoiseLatent;
}

export interface SyntheticScenario {
  readonly id: string;
  readonly description: string;
  readonly learner: SyntheticLearnerTruth;
  readonly injectedWeaknessIds: readonly string[];
  readonly rounds: number;
}

export interface ExperimentStrategy {
  readonly objectiveStrategy: ObjectiveStrategyId;
  readonly compositionStrategy: CompositionStrategyId;
}

export interface SequenceSimulationRecord {
  readonly round: number;
  readonly sequence: PracticeSequence;
  readonly traceCount: number;
  readonly targetExposureCount: number;
  readonly latentBeforeDigest: string;
  readonly latentAfterDigest: string;
}

export interface EstimationErrorMetrics {
  readonly bindingMeanAbsoluteError: number;
  readonly transitionMeanAbsoluteErrorMs: number;
  readonly confusionMeanAbsoluteError: number;
}

export interface ExperimentMetrics {
  readonly bindingCoverage: number;
  readonly transitionCoverage: number;
  readonly weaknessIdentificationRound: number | null;
  readonly targetExposureLift: number;
  readonly heldOutPathScore: number | null;
  readonly confusionReduction: number;
  readonly commonWordShare: number;
  readonly repeatedEntryRate: number;
  readonly catalogConcentration: number;
  readonly unsupportedObjectiveRate: number;
  readonly fallbackRate: number;
  readonly meanSequenceTokenCount: number;
  readonly estimationError: EstimationErrorMetrics;
}

export interface ExperimentReport {
  readonly schemaVersion: string;
  readonly seed: string;
  readonly scenarioId: string;
  readonly strategy: ExperimentStrategy;
  readonly records: readonly SequenceSimulationRecord[];
  readonly metrics: ExperimentMetrics;
  readonly digest: string;
}
