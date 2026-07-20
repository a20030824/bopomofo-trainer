import type { RandomSource } from "../../core/model.js";
import type { LogNormalLatencyTruth } from "./types.js";

export class Mulberry32Random implements RandomSource {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new TypeError("seed must be an integer");
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

export function sampleStandardNormal(random: RandomSource): number {
  const first = Math.max(Number.MIN_VALUE, random.next());
  const second = random.next();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

export function sampleLogNormalLatency(
  truth: LogNormalLatencyTruth,
  random: RandomSource,
): number {
  if (truth.standardDeviationMs === 0) return truth.meanMs;
  const variance = truth.standardDeviationMs ** 2;
  const sigmaSquared = Math.log(1 + variance / (truth.meanMs ** 2));
  const mu = Math.log(truth.meanMs) - sigmaSquared / 2;
  const value = Math.exp(mu + Math.sqrt(sigmaSquared) * sampleStandardNormal(random));
  return Math.round(value * 1000) / 1000;
}

export function samplePositiveScale(
  standardDeviation: number,
  random: RandomSource,
): number {
  if (standardDeviation === 0) return 1;
  return Math.max(0.05, 1 + standardDeviation * sampleStandardNormal(random));
}
