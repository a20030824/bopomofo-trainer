export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortedUnique(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

export function fnvDigest(source: string): string {
  let digest = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    digest ^= source.charCodeAt(index);
    digest = Math.imul(digest, 16777619);
  }
  return (digest >>> 0).toString(16).padStart(8, "0");
}

export function stableSeedTieBreak(seed: number, entryId: string): number {
  return Number.parseInt(fnvDigest(`${seed}:${entryId}`), 16) >>> 0;
}

export function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function rounded(value: number): number {
  return Number(value.toFixed(12));
}

export function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

export function validateSeed(seed: number): void {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("seed must be a safe integer");
  }
}
