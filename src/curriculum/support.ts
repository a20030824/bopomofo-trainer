import type { CatalogEntry, TokenId } from "../core/model.js";
import type { CatalogSupportIndex, CatalogTokenSupport } from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function entryTokenSet(entry: CatalogEntry): ReadonlySet<TokenId> {
  return new Set(entry.syllables.flatMap((syllable) => syllable.tokens));
}

export function createCatalogSupportIndex(entries: readonly CatalogEntry[]): CatalogSupportIndex {
  const entriesById: Record<string, CatalogEntry> = {};
  const tokenEntries = new Map<TokenId, Set<string>>();
  const bandCounts = new Map<TokenId, { 1: number; 2: number; 3: number }>();

  for (const entry of entries) {
    if (entriesById[entry.id] !== undefined) throw new Error(`duplicate catalog entry id: ${entry.id}`);
    entriesById[entry.id] = entry;
    for (const tokenId of entryTokenSet(entry)) {
      const ids = tokenEntries.get(tokenId) ?? new Set<string>();
      ids.add(entry.id);
      tokenEntries.set(tokenId, ids);
      const counts = bandCounts.get(tokenId) ?? { 1: 0, 2: 0, 3: 0 };
      counts[entry.frequencyBand] += 1;
      bandCounts.set(tokenId, counts);
    }
  }

  const byToken: Record<string, CatalogTokenSupport> = {};
  for (const tokenId of [...tokenEntries.keys()].sort(codeUnitCompare)) {
    const entryIds = [...tokenEntries.get(tokenId)!].sort(codeUnitCompare);
    const frequencyBandCounts = bandCounts.get(tokenId)!;
    byToken[tokenId] = {
      tokenId,
      entryIds,
      entryCount: entryIds.length,
      commonEntryCount: frequencyBandCounts[1],
      frequencyBandCounts,
    };
  }

  return { byToken, entriesById };
}
