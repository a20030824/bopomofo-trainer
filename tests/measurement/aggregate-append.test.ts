import { describe, expect, it } from "vitest";
import { aggregateMeasurements } from "../../src/measurement/aggregate.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../../src/measurement/policy.js";
import type { TraceMeasurementDecision } from "../../src/measurement/types.js";

function decision(sequence: number, timingMs: number): TraceMeasurementDecision {
  return {
    traceSequence: sequence,
    context: "tone",
    binding: {
      included: true,
      observation: {
        traceSequence: sequence,
        scope: { mode: "guided", layoutId: "standard", tokenId: "tone:1" },
        context: "tone",
        physicalCode: "Space",
        correct: true,
        timingMs,
        timingExclusionReason: null,
      },
    },
    confusion: { included: false, reason: "not-incorrect" },
    transition: {
      included: true,
      observation: {
        traceSequence: sequence,
        scope: {
          mode: "guided",
          layoutId: "standard",
          fromToken: "zhuyin:ㄚ",
          toToken: "tone:1",
        },
        context: "tone",
        timingMs,
      },
    },
  };
}

describe("measurement accumulation", () => {
  it("appends observations without resetting cumulative smoothing", () => {
    const first = aggregateMeasurements([decision(1, 100)], PHASE_3_MEASUREMENT_POLICY);
    const second = aggregateMeasurements(
      [decision(2, 200)],
      PHASE_3_MEASUREMENT_POLICY,
      first,
    );
    const binding = Object.values(second.bindings)[0]!;
    expect(second.traceCount).toBe(2);
    expect(binding.attempts).toBe(2);
    expect(binding.timingSamples).toBe(2);
    expect(binding.currentTimeToTypeMs).toBe(125);
    expect(binding.bestTimeToTypeMs).toBe(100);
    expect(Object.values(second.transitions)[0]!.currentTimeToTypeMs).toBe(125);
  });

  it("refuses to append across measurement policy versions", () => {
    const first = aggregateMeasurements([decision(1, 100)], PHASE_3_MEASUREMENT_POLICY);
    expect(() => aggregateMeasurements([], {
      ...PHASE_3_MEASUREMENT_POLICY,
      version: "future",
    }, first)).toThrow(/cannot append/);
  });
});
