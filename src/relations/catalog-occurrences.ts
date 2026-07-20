import type { CatalogEntry, TokenId } from "../core/model.js";
import type {
  BindingOccurrence,
  CatalogPartition,
  TransitionOccurrence,
} from "./types.js";

export function bindingRelationKey(tokenId: TokenId): string {
  return JSON.stringify(["binding", tokenId]);
}

export function transitionRelationKey(fromToken: TokenId, toToken: TokenId): string {
  return JSON.stringify(["transition", fromToken, toToken]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function bindingContext(
  tokenId: TokenId,
  tokenIndex: number,
): BindingOccurrence["context"] {
  if (tokenId.startsWith("tone:")) return "tone";
  return tokenIndex === 0 ? "syllable-start" : "within-syllable";
}

export interface CatalogOccurrenceIndex {
  readonly bindingOccurrences: Readonly<Record<string, readonly BindingOccurrence[]>>;
  readonly transitionOccurrences: Readonly<Record<string, readonly TransitionOccurrence[]>>;
  readonly syllableCount: number;
  readonly tokenCount: number;
  readonly transitionCount: number;
}

export function indexCatalogOccurrences(
  entries: readonly CatalogEntry[],
  partitionByEntryId: Readonly<Record<string, CatalogPartition>>,
): CatalogOccurrenceIndex {
  const binding = new Map<string, BindingOccurrence[]>();
  const transition = new Map<string, TransitionOccurrence[]>();
  const seenEntryIds = new Set<string>();
  let syllableCount = 0;
  let tokenCount = 0;
  let transitionCount = 0;

  for (const entry of [...entries].sort((left, right) => compareText(left.id, right.id))) {
    if (seenEntryIds.has(entry.id)) {
      throw new Error(`duplicate catalog entry id: ${entry.id}`);
    }
    seenEntryIds.add(entry.id);
    const partition = partitionByEntryId[entry.id];
    if (partition === undefined) {
      throw new Error(`missing catalog partition for entry: ${entry.id}`);
    }

    for (let syllableIndex = 0; syllableIndex < entry.syllables.length; syllableIndex += 1) {
      const syllable = entry.syllables[syllableIndex]!;
      syllableCount += 1;
      tokenCount += syllable.tokens.length;

      for (let tokenIndex = 0; tokenIndex < syllable.tokens.length; tokenIndex += 1) {
        const tokenId = syllable.tokens[tokenIndex]!;
        const occurrence: BindingOccurrence = {
          kind: "binding",
          entryId: entry.id,
          syllableIndex,
          tokenIndex,
          tokenId,
          context: bindingContext(tokenId, tokenIndex),
          frequencyBand: entry.frequencyBand,
          tags: entry.tags,
          provenanceIds: entry.provenanceIds,
          partition,
        };
        const key = bindingRelationKey(tokenId);
        binding.set(key, [...(binding.get(key) ?? []), occurrence]);
      }

      for (let fromTokenIndex = 0; fromTokenIndex + 1 < syllable.tokens.length; fromTokenIndex += 1) {
        const fromToken = syllable.tokens[fromTokenIndex]!;
        const toToken = syllable.tokens[fromTokenIndex + 1]!;
        const occurrence: TransitionOccurrence = {
          kind: "transition",
          entryId: entry.id,
          syllableIndex,
          fromTokenIndex,
          fromToken,
          toToken,
          frequencyBand: entry.frequencyBand,
          tags: entry.tags,
          provenanceIds: entry.provenanceIds,
          partition,
        };
        const key = transitionRelationKey(fromToken, toToken);
        transition.set(key, [...(transition.get(key) ?? []), occurrence]);
        transitionCount += 1;
      }
    }
  }

  const sortedRecord = <T>(source: ReadonlyMap<string, readonly T[]>): Readonly<Record<string, readonly T[]>> =>
    Object.fromEntries([...source.entries()].sort(([left], [right]) => compareText(left, right)));

  return {
    bindingOccurrences: sortedRecord(binding),
    transitionOccurrences: sortedRecord(transition),
    syllableCount,
    tokenCount,
    transitionCount,
  };
}
