import type { Exercise, TimingContext, TokenId } from "../core/model.js";

export type InteractionOutcome =
  | "correct"
  | "incorrect"
  | "unmapped"
  | "ignored-repeat"
  | "ignored-modifier"
  | "composition";

export interface ExerciseTarget {
  readonly position: number;
  readonly entryId: string;
  readonly entryIndex: number;
  readonly syllableIndex: number;
  readonly tokenIndex: number;
  readonly tokenId: TokenId;
  readonly context: TimingContext;
}

export interface InteractionInput {
  readonly timestampMs: number;
  readonly physicalCode: string;
  readonly actualToken: TokenId | null;
  readonly repeat: boolean;
  readonly composing: boolean;
  readonly modifierOnly: boolean;
}

export interface InteractionTrace {
  readonly sequence: number;
  readonly timestampMs: number;
  readonly elapsedSinceAdvanceMs: number;
  readonly exerciseId: string;
  readonly entryId: string;
  readonly expectedToken: TokenId;
  readonly actualToken: TokenId | null;
  readonly physicalCode: string;
  readonly correct: boolean | null;
  readonly advanced: boolean;
  readonly position: number;
  readonly context: TimingContext;
  readonly outcome: InteractionOutcome;
  readonly previousToken: TokenId | null;
  readonly recovery: boolean;
  readonly repeat: boolean;
  readonly composing: boolean;
  readonly modifierOnly: boolean;
  readonly entryIndex: number;
  readonly syllableIndex: number;
  readonly tokenIndex: number;
}

export interface InteractionSessionState {
  readonly exercise: Exercise;
  readonly targets: readonly ExerciseTarget[];
  readonly position: number;
  readonly lastAdvanceTimestampMs: number;
  readonly traces: readonly InteractionTrace[];
  readonly hadErrorSinceAdvance: boolean;
  readonly completed: boolean;
}

function contextFor(
  position: number,
  syllableIndex: number,
  tokenIndex: number,
  tokenId: TokenId,
): TimingContext {
  if (position === 0) return "exercise-start";
  if (syllableIndex === 0 && tokenIndex === 0) return "entry-start";
  if (tokenIndex === 0) return "syllable-start";
  if (tokenId.startsWith("tone:")) return "tone";
  return "within-syllable";
}

export function flattenExercise(exercise: Exercise): readonly ExerciseTarget[] {
  const targets: ExerciseTarget[] = [];
  exercise.entries.forEach((entry, entryIndex) => {
    entry.syllables.forEach((syllable, syllableIndex) => {
      syllable.tokens.forEach((tokenId, tokenIndex) => {
        const position = targets.length;
        targets.push({
          position,
          entryId: entry.id,
          entryIndex,
          syllableIndex,
          tokenIndex,
          tokenId,
          context: contextFor(position, syllableIndex, tokenIndex, tokenId),
        });
      });
    });
  });
  return targets;
}

export function createInteractionSession(
  exercise: Exercise,
  startedAtMs: number,
): InteractionSessionState {
  const targets = flattenExercise(exercise);
  return {
    exercise,
    targets,
    position: 0,
    lastAdvanceTimestampMs: startedAtMs,
    traces: [],
    hadErrorSinceAdvance: false,
    completed: targets.length === 0,
  };
}

function ignoredOutcome(input: InteractionInput): InteractionOutcome | null {
  if (input.composing) return "composition";
  if (input.repeat) return "ignored-repeat";
  if (input.modifierOnly) return "ignored-modifier";
  return null;
}

export function applyInteractionInput(
  state: InteractionSessionState,
  input: InteractionInput,
): InteractionSessionState {
  if (state.completed) return state;
  const target = state.targets[state.position];
  if (target === undefined) return { ...state, completed: true };

  const ignored = ignoredOutcome(input);
  const mappedCorrect = input.actualToken === target.tokenId;
  const outcome: InteractionOutcome = ignored
    ?? (input.actualToken === null ? "unmapped" : mappedCorrect ? "correct" : "incorrect");
  const accepted = ignored === null;
  const correct = accepted ? mappedCorrect : null;
  const advanced = correct === true;
  const recovery = advanced && state.hadErrorSinceAdvance;
  const elapsedSinceAdvanceMs = Math.max(0, input.timestampMs - state.lastAdvanceTimestampMs);
  const previousToken = state.position > 0
    ? state.targets[state.position - 1]?.tokenId ?? null
    : null;

  const trace: InteractionTrace = {
    sequence: state.traces.length + 1,
    timestampMs: input.timestampMs,
    elapsedSinceAdvanceMs,
    exerciseId: state.exercise.id,
    entryId: target.entryId,
    expectedToken: target.tokenId,
    actualToken: input.actualToken,
    physicalCode: input.physicalCode,
    correct,
    advanced,
    position: target.position,
    context: target.context,
    outcome,
    previousToken,
    recovery,
    repeat: input.repeat,
    composing: input.composing,
    modifierOnly: input.modifierOnly,
    entryIndex: target.entryIndex,
    syllableIndex: target.syllableIndex,
    tokenIndex: target.tokenIndex,
  };

  const nextPosition = advanced ? state.position + 1 : state.position;
  return {
    ...state,
    position: nextPosition,
    lastAdvanceTimestampMs: advanced ? input.timestampMs : state.lastAdvanceTimestampMs,
    traces: [...state.traces, trace],
    hadErrorSinceAdvance: advanced
      ? false
      : state.hadErrorSinceAdvance || outcome === "incorrect",
    completed: nextPosition >= state.targets.length,
  };
}
