import type { TokenId } from "../core/model.js";
import { DIAGNOSTIC_POLICY } from "./policy.js";
import type {
  ConfusionDiagnostic,
  KeyDiagnostic,
  TransitionDiagnostic,
} from "./types.js";

export type KeyDiagnosticSort = "error-ratio" | "timing";
export type TransitionDirection = "incoming" | "outgoing" | "both";
export type ConfusionDirection = "expected" | "actual" | "both";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function selectKeyDiagnostics(
  rows: readonly KeyDiagnostic[],
  sort: KeyDiagnosticSort,
  complete = false,
): readonly KeyDiagnostic[] {
  const sorted = [...rows].sort((left, right) => {
    if (sort === "timing") {
      const leftHasTiming = left.timingAvailability === "available" && left.timingMs !== null;
      const rightHasTiming = right.timingAvailability === "available" && right.timingMs !== null;
      if (leftHasTiming !== rightHasTiming) return leftHasTiming ? -1 : 1;
      if (leftHasTiming && rightHasTiming) {
        const timingDifference = (right.timingMs ?? 0) - (left.timingMs ?? 0);
        if (timingDifference !== 0) return timingDifference;
        if (right.timingSamples !== left.timingSamples) {
          return right.timingSamples - left.timingSamples;
        }
      }
    } else {
      const leftHasRatio = left.displayedErrorRatio !== null;
      const rightHasRatio = right.displayedErrorRatio !== null;
      if (leftHasRatio !== rightHasRatio) return leftHasRatio ? -1 : 1;
      if (leftHasRatio && rightHasRatio) {
        const ratioDifference = (right.displayedErrorRatio ?? 0)
          - (left.displayedErrorRatio ?? 0);
        if (ratioDifference !== 0) return ratioDifference;
        if (right.attempts !== left.attempts) return right.attempts - left.attempts;
      }
    }
    return codeUnitCompare(left.tokenId, right.tokenId);
  });
  return complete ? sorted : sorted.slice(0, DIAGNOSTIC_POLICY.topLimit);
}

export interface TransitionSelection {
  readonly selectedKey: TokenId | null;
  readonly direction: TransitionDirection;
  readonly minimumSamples: number;
  readonly includeTone: boolean;
  readonly complete?: boolean;
}

export function selectTransitionDiagnostics(
  rows: readonly TransitionDiagnostic[],
  selection: TransitionSelection,
): readonly TransitionDiagnostic[] {
  const filtered = rows.filter((row) => {
    if (row.timingSamples < selection.minimumSamples) return false;
    if (!selection.includeTone && row.includesTone) return false;
    if (selection.selectedKey === null) return true;
    if (selection.direction === "incoming") return row.toTokenId === selection.selectedKey;
    if (selection.direction === "outgoing") return row.fromTokenId === selection.selectedKey;
    return row.fromTokenId === selection.selectedKey || row.toTokenId === selection.selectedKey;
  });
  const sorted = [...filtered].sort((left, right) =>
    right.timingMs - left.timingMs
    || right.timingSamples - left.timingSamples
    || codeUnitCompare(left.id, right.id)
  );
  return selection.complete ? sorted : sorted.slice(0, DIAGNOSTIC_POLICY.topLimit);
}

export interface ConfusionSelection {
  readonly selectedKey: TokenId | null;
  readonly direction: ConfusionDirection;
  readonly complete?: boolean;
}

export function selectConfusionDiagnostics(
  rows: readonly ConfusionDiagnostic[],
  selection: ConfusionSelection,
): readonly ConfusionDiagnostic[] {
  const filtered = rows.filter((row) => {
    if (selection.selectedKey === null) return true;
    if (selection.direction === "expected") {
      return row.expectedTokenId === selection.selectedKey;
    }
    if (selection.direction === "actual") {
      return row.actualTokenId === selection.selectedKey;
    }
    return row.expectedTokenId === selection.selectedKey
      || row.actualTokenId === selection.selectedKey;
  });
  const sorted = [...filtered].sort((left, right) =>
    right.occurrences - left.occurrences
    || right.expectedErrorShare - left.expectedErrorShare
    || codeUnitCompare(left.id, right.id)
  );
  return selection.complete ? sorted : sorted.slice(0, DIAGNOSTIC_POLICY.topLimit);
}
