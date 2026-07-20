# Grammar-aware practice composition

## Purpose

Practice content must not be produced by selecting several independently scored words and concatenating them. The grammar layer defines which ordered catalog-entry sequences are valid candidates before curriculum scoring is applied.

Semantic plausibility is intentionally not guaranteed. A sequence may be surprising, but every emitted multi-entry candidate must match one reviewed Mandarin template.

## Data boundary

Grammar evidence is stored in `data/source/grammar.sample.csv` as a sidecar to the lexical catalog. Domain tags such as `general`, `typing`, and `education` are not grammatical evidence.

Each active catalog entry requires exactly one grammar annotation with:

- exact text and reading identity;
- one or more reviewed grammatical roles;
- one predicate frame;
- standalone behavior;
- provenance IDs.

The current predicate frames are:

- `none`;
- `intransitive`;
- `transitive`;
- `modal`;
- `adjectival`.

Standalone behavior is separate:

- `none` — cannot be used without a template;
- `lexical-prompt` — may be shown as one reviewed fallback word;
- `utterance` — forms a complete utterance, such as `謝謝` or `對不起`.

Part of speech alone is insufficient. Predicate frame prevents treating every verb-like word as accepting the same neighbors.

## Validation

`npm run app:catalog` compiles the lexical catalog and grammar sidecar together. It fails for:

- unknown or duplicate entry identities;
- missing annotations for any active catalog entry;
- unknown roles, predicate frames, or standalone kinds;
- inconsistent role/frame combinations;
- formulaic entries mixed with ordinary roles;
- absent or unknown provenance IDs.

Generated browser catalog output includes the canonical annotation map, but the browser does not yet consume it in this PR.

## Initial templates

The V1 template set is deliberately small and explicit:

```text
temporal + subject + intransitive predicate
subject + temporal + intransitive predicate
temporal + subject + transitive predicate + object
subject + temporal + transitive predicate + object
subject + transitive predicate + object
temporal + subject + modal + verb + object
subject + modal + verb + object
temporal + subject + modal + verb
subject + modal + verb
subject + adjectival predicate
formulaic utterance
```

Examples supported by the current annotations include:

- `今天 我們 開始 練習`
- `老師 可以 使用 電腦`
- `媽媽 現在 看到 月亮`
- `謝謝`

## Candidate enumeration

`composeGrammarCandidates`:

1. requires every input entry to have an annotation;
2. indexes entries by reviewed grammar role;
3. fills templates without reusing one entry in multiple slots;
4. orders templates, role pools, and final candidates with code-unit-stable comparisons;
5. enforces a declared maximum candidate count;
6. returns complete selection identities, slot assignments, ordered entries, display text, and punctuation.

Input order does not affect canonical output for the same entries, annotations, templates, and candidate limit.

## Fallback policy

The composer never returns an arbitrary unrelated word list. When no complete template can be filled, fallback order is:

1. reviewed standalone utterance;
2. reviewed standalone lexical prompt, when enabled;
3. no candidate with explicit reasons.

## Product integration boundary

This PR creates the grammar-valid candidate universe only. Issue #43 will later:

- filter entries by unlocked frequency stage;
- score complete utterance candidates using frequency and bounded learner evidence;
- select utterances deterministically;
- persist recent utterance/template history;
- present one utterance while preserving entry, syllable, and token measurement boundaries.

The curriculum must never bypass this layer merely because an isolated word has a higher weakness score.
