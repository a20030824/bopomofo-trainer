function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    const source = value as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item !== undefined) result[key] = canonicalValue(item);
    }
    return result;
  }
  return value;
}

function hash32(source: string, seed: number): string {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Browser-safe deterministic identity digest. This is deliberately not a
 * cryptographic lineage checksum; source artifacts continue to use SHA-256.
 */
export function stableRuntimeDigest(value: unknown): string {
  const source = JSON.stringify(canonicalValue(value));
  return [
    0x243f6a88,
    0x85a308d3,
    0x13198a2e,
    0x03707344,
    0xa4093822,
    0x299f31d0,
    0x082efa98,
    0xec4e6c89,
  ].map((seed) => hash32(source, seed)).join("");
}
