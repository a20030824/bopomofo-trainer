import type { CatalogEntry, TokenId } from "../core/model.js";
import type { CatalogSupportIndex, CatalogTokenSupport } from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface EntryTokenContexts {
  readonly all: ReadonlySet<TokenId>;
  readonly binding: ReadonlySet<TokenId>;
  readonly motor: ReadonlySet<TokenId>;
}

export function entryTokenContexts(entry: CatalogEntry): EntryTokenContexts {
  const all = new Set<TokenId>();
  const binding = new Set<TokenId>();
  const motor = new Set<TokenId>();

  for (let syllableIndex = 0; syllableIndex < entry.syllables.length; syllableIndex += 1) {
    const syllable = entry.syllables[syllableIndex]!;
    for (let tokenIndex = 0; tokenIndex < syllable.tokens.length; tokenIndex += 1) {
      const tokenId = syllable.tokens[tokenIndex]!;
      all.add(tokenId);
      const entryBoundary = syllableIndex === 0 && tokenIndex === 0;
      if (!entryBoundary) binding.add(tokenId);
      if (tokenIndex > 0) motor.add(tokenId);
    }
  }

  return { all, binding, motor };
}

export function entryTokenSet(entry: CatalogEntry): ReadonlySet<TokenId> {
  return entryTokenContexts(entry).all;
}

export function createCatalogSupportIndex(entries: readonly CatalogEntry[]): CatalogSupportIndex {
  const entriesById: Record<string, CatalogEntry> = {};
  const tokenEntries = new Map<TokenId, Set<string>>();
  const bindingEntries = new Map<TokenId, Set<string>>();
  const motorEntries = new Map<TokenId, Set<string>>();
  const bandCounts = new Map<TokenId, { 1: number; 2: number; 3: number }>();

  const add = (map: Map<TokenId, Set<string>>, tokenId: TokenId, entryId: string): void => {
    const ids = map.get(tokenId) ?? new Set<string>();
    ids.add(entryId);
    map.set(tokenId, ids);
  };

  for (const entry of entries) {
    if (entriesById[entry.id] !== undefined) {
      throw new Error(`duplicate catalog entry id: ${entry.id}`);
    }
    entriesById[entry.id] = entry;
    const contexts = entryTokenContexts(entry);
    for (const tokenId of contexts.all) {
      add(tokenEntries, tokenId, entry.id);
      const counts = bandCounts.get(tokenId) ?? { 1: 0, 2: 0, 3: 0 };
      counts[entry.frequencyBand] += 1;
      bandCounts.set(tokenId, counts);
    }
    for (const tokenId of contexts.binding) add(bindingEntries, tokenId, entry.id);
    for (const tokenId of contexts.motor) add(motorEntries, tokenId, entry.id);
  }

  const sortedIds = (map: Map<TokenId, Set<string>>, tokenId: TokenId): string[] =>
    [...(map.get(tokenId) ?? [])].sort(codeUnitCompare);
  const commonCount = (entryIds: readonly string[]): number =>
    entryIds.filter((entryId) => entriesById[entryId]!.frequencyBand === 1).length;

  const byToken: Record<string, CatalogTokenSupport> = {};
  for (const tokenId of [...tokenEntries.keys()].sort(codeUnitCompare)) {
    const entryIds = sortedIds(tokenEntries, tokenId);
    const bindingEntryIds = sortedIds(bindingEntries, tokenId);
    const motorEntryIds = sortedIds(motorEntries, tokenId);
    const frequencyBandCounts = bandCounts.get(tokenId)!;
    byToken[tokenId] = {
      tokenId,
      entryIds,
      entryCount: entryIds.length,
      bindingEntryIds,
      bindingEntryCount: bindingEntryIds.length,
      motorEntryIds,
      motorEntryCount: motorEntryIds.length,
      commonEntryCount: frequencyBandCounts[1],
      commonBindingEntryCount: commonCount(bindingEntryIds),
      commonMotorEntryCount: commonCount(motorEntryIds),
      frequencyBandCounts,
    };
  }

  return { byToken, entriesById };
}
