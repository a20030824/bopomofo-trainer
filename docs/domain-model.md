# Domain Model

## Scope

The first architecture is intentionally Bopomofo-specific. It supports one semantic writing system with multiple physical keyboard layouts. It does not attempt to be a universal typing-engine abstraction for Pinyin, Cangjie, or unrelated input methods.

## Core concepts

### Prompt

Human-readable Chinese context shown to the learner.

```ts
interface Prompt {
  text: string;
  locale: "zh-TW";
}
```

The prompt is context, not the measured answer by itself.

### Practice mode

Defines what information is visible and therefore what the timing data means.

```ts
type PracticeMode = "guided" | "recall";
```

- `guided`: Chinese context and complete Bopomofo reading are visible. V1 statistics represent symbol-to-key mapping and motor execution.
- `recall`: Bopomofo is hidden or partially hidden. Timing also contains pronunciation retrieval and must remain statistically separate.

V1 implements only `guided`.

### Token

The smallest semantic input unit in a Bopomofo reading. A token is not a physical key.

Examples:

- `zhuyin:ㄓ`
- `zhuyin:ㄨ`
- `zhuyin:ㄥ`
- `tone:1`

```ts
type TokenId = string;

interface TokenDefinition {
  id: TokenId;
  label: string;
  kind: "bopomofo" | "tone";
}
```

Initial, medial, and final roles are properties of a syllable parse, not permanent token identity. This avoids treating a linguistic classification table as the grammar itself.

### Syllable

An ordered semantic token sequence ending in exactly one explicit tone token.

```ts
interface Syllable {
  tokens: readonly TokenId[];
}
```

Invariants:

- every syllable contains exactly one tone token;
- the tone token is the final token;
- first tone is represented explicitly as `tone:1`;
- physical key codes never appear in a syllable;
- legal Bopomofo structure is validated by the reading parser, not by token metadata alone.

### Catalog entry

A reviewed or provisional vocabulary entry plus its semantic reading and provenance references.

```ts
interface CatalogEntry {
  id: string;
  prompt: Prompt;
  syllables: readonly Syllable[];
  frequencyBand: 1 | 2 | 3;
  tags: readonly string[];
  provenanceIds: readonly string[];
}
```

A catalog entry is content. It is not automatically one complete on-screen exercise.

### Exercise

A short ordered sequence of catalog entries selected for continuous practice.

```ts
interface Exercise {
  id: string;
  mode: PracticeMode;
  layoutId: string;
  entries: readonly CatalogEntry[];
}
```

Separating `CatalogEntry` from `Exercise` allows several words to be typed without a full visual and timing reset after every word, while retaining word and syllable boundaries.

### Input layout

Maps physical input codes to semantic tokens.

```ts
interface InputLayout {
  id: string;
  name: string;
  bindings: Readonly<Record<string, TokenId>>;
}
```

The same catalog entry can be practiced with different layouts, but measured motor skill is scoped to the active layout.

### Input observation

A neutral record of one attempted input. It stores enough context to compare aggregation policies without assuming which curriculum is correct.

```ts
type TimingContext =
  | "exercise-start"
  | "entry-start"
  | "syllable-start"
  | "within-syllable"
  | "tone";

interface InputObservation {
  exerciseId: string;
  entryId: string;
  mode: PracticeMode;
  layoutId: string;
  expectedToken: TokenId;
  actualToken: TokenId | null;
  physicalCode: string;
  previousToken: TokenId | null;
  latencyMs: number;
  correct: boolean;
  position: number;
  context: TimingContext;
}
```

Observations retain raw context. Aggregation decides which contexts update a skill estimate.

### Binding skill

The primary V1 measured skill is not a bare token. It is a semantic token practiced through a particular layout and presentation mode.

```ts
interface BindingSkillScope {
  mode: PracticeMode;
  layoutId: string;
  tokenId: TokenId;
}
```

Example:

```text
guided / zhuyin-standard / zhuyin:ㄥ
```

This prevents performance learned on one physical layout from being silently reused on another and prevents recall-mode timing from contaminating guided motor timing.

### Learner profile

Aggregated performance derived from observations.

```ts
interface SkillStats {
  attempts: number;
  errors: number;
  currentTimeToTypeMs: number | null;
  bestTimeToTypeMs: number | null;
  currentConfidence: number | null;
  bestConfidence: number | null;
}

interface LearnerProfile {
  bindingStats: Readonly<Record<string, SkillStats>>;
  transitionStats: Readonly<Record<string, TransitionStats>>;
  confusionStats: Readonly<Record<string, number>>;
}
```

String keys are stable serialized skill identities. Construction and parsing must be centralized rather than duplicated through the codebase.

## Timing policy for V1

Timing contexts are not equivalent.

- `exercise-start`: records initial orientation only; it does not update binding confidence.
- `entry-start`: may include reading and visual relocation; record separately.
- `syllable-start`: retain separately until human data shows whether it is a useful motor measure.
- `within-syllable`: primary timing source for Bopomofo token bindings.
- `tone`: primary timing source for tone bindings.

This policy remains provisional until the interaction spike produces real event traces.

## Identity rules

- Catalog entry IDs remain stable if frequency metadata changes.
- Binding statistics are scoped by practice mode, layout ID, and token ID.
- Transition statistics are scoped by practice mode and layout ID.
- Transition IDs are directional: `from>to` differs from `to>from`.
- Recall-mode data never updates guided-mode confidence.
- Physical key codes belong to observations and layouts, never catalog readings.

## Curriculum states

A token binding can be:

- `unobserved`: insufficient data, not automatically equivalent to weak;
- `sampling`: receiving baseline coverage;
- `eligible`: enough data and catalog support to become a focus;
- `focused`: selected for the current exercise;
- `cooldown`: temporarily ineligible to prevent repetition.

The curriculum first establishes coverage, then adapts among eligible skills.

## Open questions

- Which timing contexts should update the final V1 confidence after interaction testing?
- How many entries should form one exercise before cognitive resets become noticeable?
- Should errors reset the latency clock, preserve it, or produce a separate recovery measure?
- Whether transition statistics materially improve curriculum selection.
- How to handle words with multiple accepted readings and regional variants.
- Whether raw observations should be retained after aggregation.