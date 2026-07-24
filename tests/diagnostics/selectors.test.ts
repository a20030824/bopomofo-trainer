import { describe, expect, it } from "vitest";
import {
  selectConfusionDiagnostics,
  selectKeyDiagnostics,
  selectTransitionDiagnostics,
} from "../../src/diagnostics/selectors.js";
import type {
  ConfusionDiagnostic,
  KeyDiagnostic,
  TransitionDiagnostic,
} from "../../src/diagnostics/types.js";

function key(
  tokenId: string,
  ratio: number | null,
  timingMs: number | null,
  attempts = 8,
  timingSamples = 5,
): KeyDiagnostic {
  return {
    tokenId,
    symbol: tokenId,
    physicalCode: tokenId,
    physicalKey: tokenId,
    attempts,
    errors: ratio === null ? 0 : Math.round(ratio * attempts),
    displayedErrorRatio: ratio,
    errorMetricLabel: "錯誤觀察比例",
    errorDataState: "sufficient",
    timingAvailability: timingMs === null ? "not-applicable" : "available",
    timingMs,
    timingSamples,
    bestTimingMs: timingMs,
    timingDataState: timingMs === null ? null : "sufficient",
    excludedSamples: { syllableStart: 0, incorrect: 0, recovery: 0, interactionNoise: 0 },
    overallDataState: "sufficient",
    reinforcement: { state: "eligible", label: "可安排加強", reason: "已達門檻" },
  };
}

const transitions: TransitionDiagnostic[] = [
  {
    id: "transition:A->B",
    fromTokenId: "A",
    toTokenId: "B",
    fromSymbol: "A",
    toSymbol: "B",
    fromPhysicalKey: "A",
    toPhysicalKey: "B",
    timingMs: 500,
    bestTimingMs: 400,
    timingSamples: 5,
    dataState: "sufficient",
    includesTone: false,
  },
  {
    id: "transition:B->A",
    fromTokenId: "B",
    toTokenId: "A",
    fromSymbol: "B",
    toSymbol: "A",
    fromPhysicalKey: "B",
    toPhysicalKey: "A",
    timingMs: 420,
    bestTimingMs: 350,
    timingSamples: 4,
    dataState: "preliminary",
    includesTone: false,
  },
  {
    id: "transition:A->tone:1",
    fromTokenId: "A",
    toTokenId: "tone:1",
    fromSymbol: "A",
    toSymbol: "ˉ",
    fromPhysicalKey: "A",
    toPhysicalKey: "Space",
    timingMs: 600,
    bestTimingMs: 450,
    timingSamples: 8,
    dataState: "sufficient",
    includesTone: true,
  },
];

const confusions: ConfusionDiagnostic[] = [
  {
    id: "confusion:A->B",
    expectedTokenId: "A",
    actualTokenId: "B",
    expectedSymbol: "A",
    actualSymbol: "B",
    expectedPhysicalKey: "A",
    actualPhysicalKey: "B",
    occurrences: 4,
    expectedConfusionTotal: 6,
    expectedErrorShare: 4 / 6,
    dataState: "preliminary",
  },
  {
    id: "confusion:B->A",
    expectedTokenId: "B",
    actualTokenId: "A",
    expectedSymbol: "B",
    actualSymbol: "A",
    expectedPhysicalKey: "B",
    actualPhysicalKey: "A",
    occurrences: 2,
    expectedConfusionTotal: 2,
    expectedErrorShare: 1,
    dataState: "insufficient",
  },
];

describe("diagnostic selectors", () => {
  it("sorts key metrics without treating missing timing as zero", () => {
    const rows = [key("C", 0.25, null), key("B", 0.25, 500, 12, 6), key("A", 0.5, 300)];
    expect(selectKeyDiagnostics(rows, "error-ratio", true).map((row) => row.tokenId)).toEqual([
      "A", "B", "C",
    ]);
    expect(selectKeyDiagnostics(rows, "timing", true).map((row) => row.tokenId)).toEqual([
      "B", "A", "C",
    ]);
  });

  it("keeps transition directions distinct and applies sample and tone filters", () => {
    expect(selectTransitionDiagnostics(transitions, {
      selectedKey: "A",
      direction: "incoming",
      minimumSamples: 1,
      includeTone: true,
      complete: true,
    }).map((row) => row.id)).toEqual(["transition:B->A"]);
    expect(selectTransitionDiagnostics(transitions, {
      selectedKey: "A",
      direction: "outgoing",
      minimumSamples: 5,
      includeTone: false,
      complete: true,
    }).map((row) => row.id)).toEqual(["transition:A->B"]);
  });

  it("keeps expected and actual confusion directions distinct", () => {
    expect(selectConfusionDiagnostics(confusions, {
      selectedKey: "A",
      direction: "expected",
      complete: true,
    }).map((row) => row.id)).toEqual(["confusion:A->B"]);
    expect(selectConfusionDiagnostics(confusions, {
      selectedKey: "A",
      direction: "actual",
      complete: true,
    }).map((row) => row.id)).toEqual(["confusion:B->A"]);
    expect(selectConfusionDiagnostics(confusions, {
      selectedKey: "A",
      direction: "both",
      complete: true,
    }).map((row) => row.id)).toEqual(["confusion:A->B", "confusion:B->A"]);
  });
});
