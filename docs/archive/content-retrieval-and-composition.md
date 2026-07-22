# Content retrieval and composition

## Problem

Selecting a weak relation and finding useful text are separate problems. The historical six-entry exercise builder combines them and fixes the output length before knowing how much evidence the selected text provides.

The research architecture separates:

1. **objective selection** — what binding, transition, confusion, or coverage target needs evidence;
2. **retrieval** — which exact catalog occurrences support that objective;
3. **candidate scoring** — what marginal relation gain and declared cost each candidate adds;
4. **composition** — which ordered text items form a useful sequence under a budget;
5. **trace** — why each candidate was selected, excluded, rejected, or left unused.

## Retrieval units

The catalog keeps whole reviewed entries, but the relation index addresses exact occurrences:

- binding occurrence: entry, syllable, token position, entry-initial flag, and syllable/tone context;
- transition occurrence: entry, syllable, and adjacent token positions;
- confusion contrast requirement: an explicit expected-token or actual-token role from a declared contrast pool;
- held-out path: an entry excluded from training selection.

A word is not relevant merely because it contains both tokens. A transition objective `ㄓ>ㄨ` requires that exact order and adjacency inside one syllable. Retrieval revalidates indexed occurrences against the supplied catalog path, excludes evaluation occurrences, rejects missing entries, and deduplicates repeated index rows. It therefore does not trust a poisoned or stale index row as evidence by assertion alone.

Confusion composition does not treat ordinary co-occurrence as confusion training. The first version emits explicit contrast requirements only when the directional `expected>actual` pool and corresponding training binding support are both present.

## Objective resolution

Binding, transition, confusion, and combined objectives resolve to explicit relation demands. All demands in one sequence must share mode and layout.

A broad coverage objective names relation kinds but not exact relation demands. The composer returns `policy-conflict` with `coverage-objective-not-composable` instead of guessing which relation to train. A later objective policy may translate coverage demand into explicit relation demands before calling the composer.

## Candidate metadata

Every candidate exposes:

- exact objective occurrences or explicit confusion contrast requirements;
- total tokens, syllables, and token-path signature;
- frequency contribution;
- recent-entry and recent-path costs;
- same-entry repetition and same-path diversity costs;
- relation concentration risk;
- machine-readable rejection reasons.

The composer uses only reviewed `CatalogEntry` values supplied by the caller. It does not import or approve external reference words.

## Variable-length practice sequence

The canonical research output is a `PracticeSequence`, not a fixed six-word exercise. It contains:

- selected objective or objectives;
- ordered catalog items;
- exact objective occurrence references or contrast requirements;
- token, syllable, entry, and lexical-boundary counts;
- occurrence exposure and distinct supporting-entry coverage;
- common-word share and maximum observed relation concentration;
- complete retrieval, candidate-ranking, selection, fallback, and stop trace;
- a stable deterministic identifier derived from the serialized result.

A product adapter may later render this sequence as words, pages, rounds, or a continuous stream.

## Exposure accounting policy

Phase 7C counts target exposure by exact occurrence. Two valid target occurrences in one entry therefore contribute two occurrence exposures. This is not treated as equivalent to two different supporting entries:

- `achievedExposures` counts occurrences or explicit contrast roles;
- `distinctSupportingEntries` is reported separately;
- `maximumRelationConcentration` and diversity penalties expose dependence on one entry or path;
- duplicate index rows are excluded before counting.

This keeps the first implementation measurable without hiding the unresolved learning-value question. Experiments can compare occurrence-based gain with distinct-entry coverage rather than collapsing them into one number.

## Budgets and stop rules

Composition accepts configurable budgets instead of a fixed entry count:

- minimum, preferred, and maximum target exposures;
- maximum total tokens;
- maximum total syllables;
- maximum lexical boundaries;
- minimum common-word share;
- maximum same-entry repetition;
- maximum relation concentration;
- recent-entry penalty;
- recent token-path penalty;
- marginal-gain threshold.

The public stop reasons are:

- `target-satisfied`;
- `token-budget-exhausted`;
- `syllable-budget-exhausted`;
- `boundary-budget-exhausted`;
- `no-supporting-candidates`;
- `insufficient-diverse-support`;
- `marginal-gain-below-threshold`;
- `policy-conflict`;
- `fallback-completed`.

A sequence that reaches the minimum but cannot reach the preferred exposure target keeps the valid partial sequence and reports `fallback-completed`. It is not padded with unsupported entries to reach six words.

## Composition strategies

### Fixed-six baseline

`fixed-six-baseline` ranks candidates using the marginal-gain baseline and stops at six selected entries. It may stop earlier when support or another budget is exhausted. Six is a comparison cap, not a filler requirement or the canonical output length.

### Greedy marginal gain

`greedy-marginal-gain` selects the legal candidate with the highest weighted marginal target exposure, then applies stable frequency, penalty, seeded tie-break, and entry-ID ordering.

### Greedy gain per token

`greedy-gain-per-token` prioritizes weighted marginal exposure divided by token cost. It tests whether compact repeated entries improve exposure efficiency at the cost of lexical repetition.

### Diversity-aware greedy

`diversity-aware-greedy` subtracts same-path, concentration, repetition, and recent-history penalties from marginal gain. It tests whether broader entry and path support is worth additional token cost.

### Bounded beam-search experiment

`bounded-beam-search` expands only the top legal candidates up to a declared beam width and a deterministic finite depth. Beam states are ordered by preferred-target completion, minimum completion, weighted coverage, diversity feasibility, token cost, repetition, and stable path identity. The selected path is replayed through ordinary scoring so every pick receives the same trace contract as greedy strategies.

Beam search is an experiment, not evidence that a globally optimal sequence has been found.

## Determinism and traceability

Candidate entry IDs are sorted before consuming the seeded `RandomSource`. Stable sorting and canonical serialization make candidate input order irrelevant when the random stream is reset.

Every pick records:

- candidate entry and supported target evidence;
- marginal gain and gain per token;
- token, syllable, and lexical-boundary cost;
- frequency contribution;
- diversity, repetition, recent-entry, and recent-path penalties;
- strategy score and seeded tie-break value;
- rejection reasons for higher-ranked alternatives.

Retrieval exclusions, hard-budget rejection reasons, fallback reasons, and stop reasons remain machine-readable. A higher-ranked legal candidate bypassed by beam path search is marked `beam-path-dominated` rather than left unexplained.

## Ordering and boundaries

Ordering is part of composition, but Phase 7C does not invent relation evidence from ordering:

- target transitions exist only inside the original catalog syllable;
- adjacency across syllables or entries is never counted as a target transition;
- lexical boundaries equal `max(0, selectedEntryCount - 1)`;
- repeated entries and repeated token paths remain visible in usage and trace data.

## Reverse-review findings

The Phase 7C reverse review checks:

- **data pollution** — every occurrence is revalidated against the catalog path and partition;
- **hidden assumptions** — occurrence exposure is declared and distinct-entry coverage remains separate;
- **duplicate counting** — duplicate occurrence identities are excluded with a reason code;
- **boundary errors** — transitions never cross syllables or entries and lexical boundaries use `n - 1`;
- **replayability** — stable input ordering, seeded tie-breaks, canonical serialization, and deterministic beam ordering are regression tested;
- **premature abstraction** — coverage objectives are rejected until an upstream policy provides explicit relation demands.

## Finding and expanding text data

Catalog analysis precedes corpus expansion. A relation-support report identifies:

- uncovered bindings and transitions;
- relations supported only by rare words;
- relations concentrated in one lexical family;
- confusion contrasts with no balanced candidate pool;
- held-out relations that lose all training support.

New text is then sought for specific blind spots. Candidate sources are imported with provenance, frequency evidence, pronunciation review status, and relation contribution. Synthetic pseudo-words remain excluded unless introduced as a separately labeled experiment.

## Experiment matrix

Objective policy and composition policy are independent axes. Phase 7C directly supports comparisons such as:

- transition-aware objective + fixed-six baseline;
- transition-aware objective + greedy marginal gain;
- transition-aware objective + greedy gain per token;
- transition-aware objective + diversity-aware greedy;
- explicit combined demands + bounded beam search;
- confusion objective + explicit contrast requirements.

Metrics include target exposure per token, exact-occurrence coverage, distinct supporting entries, sequence length, lexical concentration, common-word share, repetition, fallback rate, and downstream latent-skill improvement.
