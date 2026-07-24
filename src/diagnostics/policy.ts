import type { DiagnosticDataState } from "./types.js";

export const DIAGNOSTIC_POLICY = {
  errorSamples: {
    preliminary: 3,
    sufficient: 8,
  },
  timingSamples: {
    preliminary: 3,
    sufficient: 5,
  },
  relationshipSamples: {
    preliminary: 3,
    sufficient: 5,
  },
  commonConfusionOccurrences: 2,
  transitionTimingBandsMs: {
    medium: 300,
    slow: 450,
  },
  topLimit: 5,
} as const;

export function dataStateForSamples(
  samples: number,
  thresholds: { readonly preliminary: number; readonly sufficient: number },
): DiagnosticDataState {
  if (!Number.isInteger(samples) || samples < 0) {
    throw new RangeError("diagnostic sample count must be a non-negative integer");
  }
  if (samples >= thresholds.sufficient) return "sufficient";
  if (samples >= thresholds.preliminary) return "preliminary";
  return "insufficient";
}

export function conservativeDataState(
  left: DiagnosticDataState,
  right: DiagnosticDataState,
): DiagnosticDataState {
  const rank: Readonly<Record<DiagnosticDataState, number>> = {
    insufficient: 0,
    preliminary: 1,
    sufficient: 2,
  };
  return rank[left] <= rank[right] ? left : right;
}
