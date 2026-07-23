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

export interface PracticeLineRange {
  readonly startEntryIndex: number;
  readonly endEntryIndex: number;
  readonly width: number;
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

export function planBalancedPracticeLines(
  entryWidths: readonly number[],
  maxLineWidth: number,
): readonly PracticeLineRange[] {
  const entryCount = entryWidths.length;
  if (entryCount === 0) return [];

  const normalizedWidths = entryWidths.map((width) =>
    Number.isFinite(width) && width > 0 ? width : 0
  );
  const totalWidth = normalizedWidths.reduce((sum, width) => sum + width, 0);
  if (
    !Number.isFinite(maxLineWidth)
    || maxLineWidth <= 0
    || normalizedWidths.some((width) => width === 0)
    || totalWidth <= maxLineWidth
  ) {
    return [{ startEntryIndex: 0, endEntryIndex: entryCount, width: totalWidth }];
  }

  const prefixWidths = [0];
  for (const width of normalizedWidths) {
    prefixWidths.push(prefixWidths.at(-1)! + width);
  }

  const costs = Array<number>(entryCount + 1).fill(Number.POSITIVE_INFINITY);
  const lineCounts = Array<number>(entryCount + 1).fill(Number.POSITIVE_INFINITY);
  const nextBreaks = Array<number>(entryCount + 1).fill(entryCount);
  costs[entryCount] = 0;
  lineCounts[entryCount] = 0;

  for (let start = entryCount - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= entryCount; end += 1) {
      const lineWidth = prefixWidths[end]! - prefixWidths[start]!;
      if (lineWidth > maxLineWidth && end > start + 1) break;

      const overflow = Math.max(0, lineWidth - maxLineWidth);
      const unused = Math.max(0, maxLineWidth - lineWidth);
      let lineCost = overflow > 0 ? overflow ** 2 * 16 : unused ** 2;
      const isShortFinalOrphan = end === entryCount
        && end - start === 1
        && start > 0
        && lineWidth < maxLineWidth * 0.5;
      if (isShortFinalOrphan) lineCost += maxLineWidth ** 2 * 4;

      const totalCost = lineCost + costs[end]!;
      const totalLineCount = 1 + lineCounts[end]!;
      const isBetter = totalCost < costs[start]!
        || (
          totalCost === costs[start]!
          && (
            totalLineCount < lineCounts[start]!
            || (
              totalLineCount === lineCounts[start]!
              && end > nextBreaks[start]!
            )
          )
        );
      if (!isBetter) continue;
      costs[start] = totalCost;
      lineCounts[start] = totalLineCount;
      nextBreaks[start] = end;
    }
  }

  const lines: PracticeLineRange[] = [];
  let start = 0;
  while (start < entryCount) {
    const end = nextBreaks[start]!;
    lines.push({
      startEntryIndex: start,
      endEntryIndex: end,
      width: prefixWidths[end]! - prefixWidths[start]!,
    });
    start = end;
  }
  return lines;
}

export function continuousExerciseText(exercise: Exercise): string {
  return exercise.entries.map((entry) => entry.prompt.text).join("");
}
