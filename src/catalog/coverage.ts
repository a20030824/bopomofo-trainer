import type { CatalogEntry, TokenId } from "../core/model.js";
import type { CoverageReport, TokenCoverage } from "./types.js";

export function createCoverageReport(entries: readonly CatalogEntry[]): CoverageReport {
  const counts = new Map<TokenId, { occurrences: number; entries: Set<string> }>();
  let syllableCount = 0;

  for (const entry of entries) {
    syllableCount += entry.syllables.length;
    for (const syllable of entry.syllables) {
      for (const tokenId of syllable.tokens) {
        const current = counts.get(tokenId) ?? {
          occurrences: 0,
          entries: new Set<string>(),
        };
        current.occurrences += 1;
        current.entries.add(entry.id);
        counts.set(tokenId, current);
      }
    }
  }

  const tokenCoverage: TokenCoverage[] = [...counts.entries()]
    .map(([tokenId, value]) => ({
      tokenId,
      occurrences: value.occurrences,
      entryCount: value.entries.size,
    }))
    .sort((left, right) => left.tokenId.localeCompare(right.tokenId, "zh-TW"));

  return {
    entryCount: entries.length,
    syllableCount,
    tokenCoverage,
  };
}
