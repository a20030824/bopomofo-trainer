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

function alignCharacters(text: string, syllableCount: number): readonly string[] {
  if (syllableCount === 0) return [];
  if (syllableCount === 1) return [text];

  const characters = Array.from(text);
  if (characters.length === syllableCount) return characters;

  return Array.from({ length: syllableCount }, (_, index) => {
    if (index === syllableCount - 1) return characters.slice(index).join("");
    return characters[index] ?? "";
  });
}

export function buildPracticeGlyphs(exercise: Exercise): readonly PracticeGlyph[] {
  const glyphs: PracticeGlyph[] = [];
  let tokenPosition = 0;

  exercise.entries.forEach((entry, entryIndex) => {
    const characters = alignCharacters(entry.prompt.text, entry.syllables.length);
    entry.syllables.forEach((syllable, syllableIndex) => {
      const tokenStart = tokenPosition;
      tokenPosition += syllable.tokens.length;
      glyphs.push({
        character: characters[syllableIndex] ?? "",
        entryId: entry.id,
        entryIndex,
        syllableIndex,
        tokens: syllable.tokens,
        tokenStart,
        tokenEnd: tokenPosition,
      });
    });
  });

  return glyphs;
}

export function continuousExerciseText(exercise: Exercise): string {
  return exercise.entries.map((entry) => entry.prompt.text).join("");
}
