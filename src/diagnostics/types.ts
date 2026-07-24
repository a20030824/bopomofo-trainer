import type { TokenId } from "../core/model.js";

export type DiagnosticDataState = "insufficient" | "preliminary" | "sufficient";
export type DiagnosticMetricAvailability = "available" | "not-applicable";
export type DiagnosticReinforcementState = "sampling" | "neutral" | "reinforced";

export interface DiagnosticSummary {
  readonly keysWithData: number;
  readonly repeatedConfusions: number;
  readonly slowerTransitions: number;
}

export interface KeyDiagnostic {
  readonly tokenId: TokenId;
  readonly symbol: string;
  readonly physicalCode: string;
  readonly physicalKey: string;
  readonly attempts: number;
  readonly errors: number;
  readonly displayedErrorRatio: number | null;
  readonly errorMetricLabel: "錯誤觀察比例";
  readonly errorDataState: DiagnosticDataState;
  readonly timingAvailability: DiagnosticMetricAvailability;
  readonly timingMs: number | null;
  readonly timingSamples: number;
  readonly bestTimingMs: number | null;
  readonly timingDataState: DiagnosticDataState | null;
  readonly excludedSamples: {
    readonly syllableStart: number;
    readonly incorrect: number;
    readonly recovery: number;
    readonly interactionNoise: number;
  };
  readonly overallDataState: DiagnosticDataState;
  readonly reinforcement: {
    readonly state: DiagnosticReinforcementState;
    readonly label: string;
    readonly reason: string;
    readonly expectedTokenBoost: number;
  };
}

export interface TransitionDiagnostic {
  readonly id: string;
  readonly fromTokenId: TokenId;
  readonly toTokenId: TokenId;
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly fromPhysicalKey: string;
  readonly toPhysicalKey: string;
  readonly timingMs: number;
  readonly bestTimingMs: number;
  readonly timingSamples: number;
  readonly dataState: DiagnosticDataState;
  readonly includesTone: boolean;
}

export interface ConfusionDiagnostic {
  readonly id: string;
  readonly expectedTokenId: TokenId;
  readonly actualTokenId: TokenId;
  readonly expectedSymbol: string;
  readonly actualSymbol: string;
  readonly expectedPhysicalKey: string;
  readonly actualPhysicalKey: string;
  readonly occurrences: number;
  readonly expectedConfusionTotal: number;
  readonly expectedErrorShare: number;
  readonly dataState: DiagnosticDataState;
}

export interface DiagnosticModel {
  readonly summary: DiagnosticSummary;
  readonly keys: readonly KeyDiagnostic[];
  readonly transitions: readonly TransitionDiagnostic[];
  readonly confusions: readonly ConfusionDiagnostic[];
}
