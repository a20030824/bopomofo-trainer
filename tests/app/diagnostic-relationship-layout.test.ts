import { describe, expect, it } from "vitest";
import type {
  ConfusionDiagnostic,
  TransitionDiagnostic,
} from "../../src/diagnostics/types.js";
import {
  buildDiagnosticRelationshipPaths,
  diagnosticKeyboardPoints,
} from "../../src/app/diagnostic-relationship-layout.js";

const transition: TransitionDiagnostic = {
  id: "transition:zhuyin:ㄓ→zhuyin:ㄨ",
  fromTokenId: "zhuyin:ㄓ",
  toTokenId: "zhuyin:ㄨ",
  fromSymbol: "ㄓ",
  toSymbol: "ㄨ",
  fromPhysicalKey: "5",
  toPhysicalKey: "J",
  timingMs: 481,
  bestTimingMs: 332,
  timingSamples: 8,
  dataState: "sufficient",
  includesTone: false,
};

const confusion: ConfusionDiagnostic = {
  id: "confusion:zhuyin:ㄢ→zhuyin:ㄤ",
  expectedTokenId: "zhuyin:ㄢ",
  actualTokenId: "zhuyin:ㄤ",
  expectedSymbol: "ㄢ",
  actualSymbol: "ㄤ",
  expectedPhysicalKey: "0",
  actualPhysicalKey: ";",
  occurrences: 4,
  expectedConfusionTotal: 5,
  expectedErrorShare: 0.8,
  dataState: "preliminary",
};

describe("diagnostic relationship layout", () => {
  it("projects every mapped token into the shared 60-column keyboard space", () => {
    const points = diagnosticKeyboardPoints();
    expect(points.get("zhuyin:ㄅ")).toEqual({ x: 6, y: 0.5 });
    expect(points.get("zhuyin:ㄢ")).toEqual({ x: 42, y: 0.5 });
    expect(points.get("zhuyin:ㄨ")).toEqual({ x: 30, y: 2.5 });
    expect(points.get("tone:1")).toEqual({ x: 30, y: 4.5 });
  });

  it("builds deterministic directional paths and preserves selection", () => {
    const [path] = buildDiagnosticRelationshipPaths("transition", [transition], transition.id);
    expect(path).toMatchObject({
      id: transition.id,
      selected: true,
      includesTone: false,
      width: 2,
    });
    expect(path?.path.startsWith("M ")).toBe(true);

    const reverse = {
      ...transition,
      id: "transition:zhuyin:ㄨ→zhuyin:ㄓ",
      fromTokenId: transition.toTokenId,
      toTokenId: transition.fromTokenId,
      fromSymbol: transition.toSymbol,
      toSymbol: transition.fromSymbol,
    } satisfies TransitionDiagnostic;
    expect(buildDiagnosticRelationshipPaths("transition", [reverse], null)[0]?.path)
      .not.toBe(path?.path);
  });

  it("keeps confusion routing separate and marks tone relations", () => {
    const [confusionPath] = buildDiagnosticRelationshipPaths("confusion", [confusion], null);
    expect(confusionPath?.label).toContain("應按 ㄢ");
    expect(confusionPath?.includesTone).toBe(false);

    const toneTransition = {
      ...transition,
      id: "transition:zhuyin:ㄢ→tone:4",
      fromTokenId: "zhuyin:ㄢ",
      toTokenId: "tone:4",
      fromSymbol: "ㄢ",
      toSymbol: "ˋ",
      toPhysicalKey: "4",
      includesTone: true,
    } satisfies TransitionDiagnostic;
    expect(buildDiagnosticRelationshipPaths("transition", [toneTransition], null)[0]?.includesTone)
      .toBe(true);
  });
});
