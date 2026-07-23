import type { Exercise, TokenId } from "../core/model.js";

export interface PracticeGlyph {
  readonly character: string;
  readonly entryId: string;
  readonly entryIndex: number;
  readonly syllableIndex: number;
  readonly tokens: readonly TokenId[];
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

export interface PracticeEntry {
  readonly entryId: string;
  readonly entryIndex: number;
  readonly glyphs: readonly PracticeGlyph[];
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

function alignedCharacters(
  entryId: string,
  text: string,
  syllableCount: number,
): readonly string[] {
  const characters = Array.from(text);
  if (characters.length !== syllableCount) {
    throw new RangeError(
      `Cannot align practice entry ${entryId}: ${characters.length} characters for ${syllableCount} syllables`,
    );
  }
  return characters;
}

export function buildPracticeEntries(exercise: Exercise): readonly PracticeEntry[] {
  let tokenPosition = 0;

  return exercise.entries.map((entry, entryIndex) => {
    const characters = alignedCharacters(
      entry.id,
      entry.prompt.text,
      entry.syllables.length,
    );
    const entryTokenStart = tokenPosition;
    const glyphs = entry.syllables.map((syllable, syllableIndex) => {
      const tokenStart = tokenPosition;
      tokenPosition += syllable.tokens.length;
      return {
        character: characters[syllableIndex]!,
        entryId: entry.id,
        entryIndex,
        syllableIndex,
        tokens: syllable.tokens,
        tokenStart,
        tokenEnd: tokenPosition,
      } satisfies PracticeGlyph;
    });

    return {
      entryId: entry.id,
      entryIndex,
      glyphs,
      tokenStart: entryTokenStart,
      tokenEnd: tokenPosition,
    } satisfies PracticeEntry;
  });
}

export function buildPracticeGlyphs(exercise: Exercise): readonly PracticeGlyph[] {
  return buildPracticeEntries(exercise).flatMap((entry) => entry.glyphs);
}

export function continuousExerciseText(exercise: Exercise): string {
  return exercise.entries.map((entry) => entry.prompt.text).join("");
}
