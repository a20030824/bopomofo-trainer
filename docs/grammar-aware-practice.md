# Grammar-aware practice composition

## Purpose

Practice content must not be produced by selecting several independently scored words and concatenating them. The grammar layer defines which ordered catalog-entry sequences are valid candidates before curriculum scoring is applied.

Semantic plausibility is intentionally not guaranteed. A sequence may be surprising, but every emitted multi-entry candidate must match one reviewed Mandarin template.

## Hard semantic exclusion

Practice-content processing must not consider word meaning or semantics at any
stage. This is a strict product boundary, not a quality target or a temporary
implementation limitation.

The catalog, grammar annotation, template composition, candidate filtering,
ranking, validation, and evaluation paths must not:

- store or consume definitions, glosses, senses, semantic classes, semantic
  roles, selectional restrictions, animacy, sentiment, topic, intent, or world
  knowledge;
- judge whether a word combination is meaningful, plausible, coherent,
  idiomatic, appropriate, or factually sensible;
- use lexical meaning to choose among grammatical roles, predicate frames,
  readings, templates, or candidates;
- use embeddings, language-model judgments, knowledge graphs, semantic
  similarity, collocation meaning, or any equivalent semantic proxy;
- add a semantic repair, reranking, rejection, or fallback stage, whether at
  build time or runtime.

Permitted evidence is limited to non-semantic form and syntax: written form,
pronunciation records, corpus frequency, part-of-speech and morphosyntactic
labels, dependency relations, observed surface position, predicate valency,
declared grammar roles, and template compatibility. When the available
non-semantic evidence cannot resolve an annotation or reading, processing must
retain every otherwise valid form or fail closed according to the relevant data
contract; it must never resolve the case by interpreting meaning.

Consequently, grammar validity means only that a candidate satisfies declared
formal constraints. It makes no claim about meaning or semantic naturalness,
and semantic oddity is not a defect under this specification.

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
- `ambitransitive`;
- `modal`;
- `adjectival`.

`ambitransitive` is explicit rather than inferred. It is used only when a reviewed item can appear both without and with an object, such as the current provisional annotations for `練習` and `學習`.

Standalone behavior is separate:

- `none` — cannot be used without a template;
- `lexical-prompt` — may be shown as one reviewed fallback word;
- `utterance` — forms a complete utterance, such as `謝謝` or `對不起`.

Part of speech alone is insufficient. Predicate frame prevents treating every verb-like word as accepting the same neighbors. For example, `使用` may fill a verb slot only in a template that also supplies an object; the composer cannot emit `老師 可以 使用` as a complete candidate.

## Validation

`npm run app:catalog` compiles the lexical catalog and grammar sidecar together. It fails for:

- unknown or duplicate entry identities;
- missing annotations for any active catalog entry;
- unknown roles, predicate frames, or standalone kinds;
- inconsistent role/frame combinations;
- formulaic entries mixed with ordinary roles;
- absent or unknown provenance IDs.

The manual grammar decisions use their own `local:grammar-review-v1` provenance record rather than inheriting lexical-sample provenance.

Generated browser catalog output includes the canonical annotation map, but the browser does not yet consume it in this PR.

## Initial templates

The V1 template set is deliberately small and explicit:

```text
temporal + subject + intransitive predicate
subject + temporal + intransitive predicate
temporal + subject + transitive predicate + object
subject + temporal + transitive predicate + object
subject + transitive predicate + object
temporal + subject + modal + transitive/ambitransitive verb + object
subject + modal + transitive/ambitransitive verb + object
temporal + subject + modal + intransitive/ambitransitive verb
subject + modal + intransitive/ambitransitive verb
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
3. checks each slot's accepted predicate frames;
4. fills templates without reusing one entry in multiple slots;
5. orders templates, role pools, and final candidates with code-unit-stable comparisons;
6. enforces a declared maximum candidate count;
7. takes candidates round-robin across templates before applying the global cap, so one high-cardinality template cannot erase every other sentence shape;
8. returns complete selection identities, slot assignments, ordered entries, display text, and punctuation.

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
