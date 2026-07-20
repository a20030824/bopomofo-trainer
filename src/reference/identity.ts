import type { Syllable } from "../core/model.js";
import type { ReferenceCandidate } from "./types.js";

export function semanticReferenceIdentity(
  text: string,
  syllables: readonly Syllable[],
): string {
  return JSON.stringify([
    text,
    syllables.map((syllable) => syllable.tokens),
  ]);
}

export function candidateSemanticIdentity(candidate: ReferenceCandidate): string {
  return semanticReferenceIdentity(candidate.text, candidate.syllables);
}
