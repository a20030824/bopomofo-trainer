# Domain Model

## Core concepts

### Prompt

Human-readable content shown to the learner. The first catalog uses Traditional Chinese words.

```ts
interface Prompt {
  text: string;
  locale: "zh-TW";
}
```

### Token

The smallest semantic unit measured by the curriculum. A token is not a physical key.

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
  kind: "initial" | "medial" | "final" | "tone";
}
```

### Syllable

An ordered token sequence ending in exactly one explicit tone token.

```ts
interface Syllable {
  tokens: readonly TokenId[];
}
```

Invariants:

- every syllable contains exactly one tone token;
- the tone token is the final token;
- first tone is represented explicitly as `tone:1`;
- physical key codes never appear in a syllable.

### Training item

A reviewed prompt plus its semantic answer.

```ts
interface TrainingItem {
  id: string;
  prompt: Prompt;
  syllables: readonly Syllable[];
  frequencyBand: 1 | 2 | 3;
  tags: readonly string[];
}
```

### Input layout

Maps physical input codes to semantic tokens.

```ts
interface InputLayout {
  id: string;
  name: string;
  bindings: Readonly<Record<string, TokenId>>;
}
```

The same `TrainingItem` can be practiced with different layouts.

### Input observation

A neutral record of one attempted input. It stores enough context for different metric models without assuming which curriculum is correct.

```ts
type TimingContext =
  | "prompt-start"
  | "syllable-start"
  | "within-syllable"
  | "tone";

interface InputObservation {
  itemId: string;
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

### Learner profile

Aggregated performance derived from observations.

```ts
interface TokenStats {
  attempts: number;
  errors: number;
  currentTimeToTypeMs: number | null;
  bestTimeToTypeMs: number | null;
  currentConfidence: number | null;
  bestConfidence: number | null;
}

interface LearnerProfile {
  tokenStats: Readonly<Record<TokenId, TokenStats>>;
  transitionStats: Readonly<Record<string, unknown>>;
  confusionStats: Readonly<Record<string, number>>;
}
```

## Identity rules

- Token statistics are semantic and can be shared across compatible layouts.
- Physical-key statistics, when introduced, must be scoped by layout ID.
- Transition IDs are directional: `from>to` differs from `to>from`.
- Catalog item IDs must remain stable even if frequency metadata changes.

## Open questions

- Whether first-token latency should influence token confidence at all.
- Whether transition statistics materially improve curriculum selection.
- Whether learner profiles should be per layout, merged, or layered.
- How to handle words with multiple accepted readings.
