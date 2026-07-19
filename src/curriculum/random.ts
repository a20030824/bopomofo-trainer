import type { RandomSource } from "../core/model.js";

function hashSeed(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function createSeededRandom(seed: number | string): RandomSource {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  if (state === 0) state = 0x6d2b79f5;
  return {
    next(): number {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export interface WeightedCandidate<T> {
  readonly value: T;
  readonly weight: number;
}

export function weightedPick<T>(
  candidates: readonly WeightedCandidate<T>[],
  random: RandomSource,
): T {
  if (candidates.length === 0) throw new Error("weightedPick requires candidates");
  let total = 0;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.weight) || candidate.weight < 0) {
      throw new RangeError("candidate weights must be finite and non-negative");
    }
    total += candidate.weight;
  }
  if (total <= 0) throw new Error("weightedPick requires a positive total weight");
  let threshold = random.next() * total;
  for (const candidate of candidates) {
    threshold -= candidate.weight;
    if (threshold < 0) return candidate.value;
  }
  return candidates[candidates.length - 1]!.value;
}
