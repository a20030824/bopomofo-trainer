import type { DeterminismDigest } from "../learner/types.js";

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort(compareKeys)
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function createDeterminismDigest(value: unknown): DeterminismDigest {
  const source = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return {
    algorithm: "fnv1a32",
    value: hash.toString(16).padStart(8, "0"),
    canonicalizationReason: "recursive-code-unit-key-order",
  };
}
