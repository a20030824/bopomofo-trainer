# Content retrieval and composition

## Problem

Selecting a weak relation and finding useful text are separate problems. The current six-entry exercise builder combines them and fixes the output length before knowing how much evidence the selected text provides.

The research architecture separates:

1. **objective selection** — what binding, transition, confusion, or coverage target needs evidence;
2. **retrieval** — which exact catalog occurrences support that objective;
3. **composition** — which ordered text items form a useful sequence under a budget.

## Retrieval units

The catalog keeps whole reviewed entries, but the relation index addresses exact occurrences:

- token occurrence: entry, syllable, token position;
- transition occurrence: entry, syllable, adjacent positions;
- contrast candidate: an entry exposing the expected token, actual token, or both;
- held-out path: an entry excluded from training selection.

A word is not relevant merely because it contains both tokens. A transition objective `ㄓ>ㄨ` requires that exact order and adjacency inside one syllable.

## Candidate metadata

Every candidate exposes:

- exact objective occurrences and secondary relations;
- total tokens, syllables, and boundaries;
- frequency band and provenance status;
- tags and lexical identity;
- recent-use and cumulative-use counts;
- overlap with held-out paths;
- concentration risk: how dependent the objective is on this entry;
- contrast role for confusion objectives.

## Variable-length practice sequence

The canonical research output is a `PracticeSequence`, not a fixed six-word exercise. It contains:

- selected objective or objectives;
- ordered catalog items;
- exact objective occurrence references;
- token, syllable, entry, and boundary counts;
- expected target exposures;
- lexical-quality and repetition costs;
- complete retrieval and composition trace;
- stop reason.

A product adapter may later render this sequence as words, pages, rounds, or a continuous stream.

## Budgets and stop rules

Composition accepts configurable budgets instead of a fixed entry count:

- minimum and maximum target exposures;
- maximum total tokens or syllables;
- maximum entries and boundaries;
- maximum repeated-entry and repeated-path cost;
- minimum common-word share;
- optional duration estimate.

Selection stops when one of these becomes true:

- required evidence is reached;
- the token or syllable budget is exhausted;
- no legal candidate remains;
- the best remaining candidate adds too little marginal evidence;
- lexical or repetition constraints would be violated.

This allows a sequence to contain two long entries, several short entries, or a contrast pair without pretending that six words are equivalent units.

## Composition strategies

### Fixed-count baseline

Reproduce the current six-entry behavior for comparison. It is a baseline, not the default research model.

### Greedy target exposure

At each step, select the candidate with the highest target-exposure gain per cost. Costs include rarity, repetition, boundaries, and concentration.

### Balanced set cover

Select a small sequence that reaches the primary target while retaining declared secondary coverage. This tests whether one sequence can train a relation without collapsing broad exposure.

### Contrast composer

For a confusion `expected>actual`, select alternating or mixed entries that provide controlled occurrences of both tokens. It must report balance, ordering, and whether an entry contains both tokens.

### Multi-objective composer

Satisfy explicit exposure demands for several relation objectives. It may reject objectives that cannot be jointly supported within the budget rather than silently diluting all of them.

## Ordering is part of composition

After choosing entries, ordering remains an optimization problem. Reports must distinguish:

- within-entry target transitions;
- entry-boundary adjacency, which is not clean transition evidence;
- consecutive repetition of the same entry or path;
- contrast spacing;
- clustering versus interleaving of objectives.

The composer does not invent cross-entry transition evidence.

## Finding and expanding text data

Catalog analysis precedes corpus expansion. A relation-support report identifies:

- uncovered bindings and transitions;
- relations supported only by rare words;
- relations concentrated in one lexical family;
- confusion contrasts with no balanced candidate pool;
- held-out relations that lose all training support.

New text is then sought for specific blind spots. Candidate sources are imported with provenance, frequency evidence, pronunciation review status, and relation contribution. Synthetic pseudo-words remain excluded unless introduced as a separately labeled experiment.

## Experiment matrix

Objective policy and composition policy are independent axes. Experiments should compare combinations such as:

- transition-aware objective + fixed-count composer;
- transition-aware objective + greedy composer;
- binding-only objective + balanced set cover;
- confusion objective + contrast composer;
- combined objective + constrained multi-objective composer.

Metrics include target exposure per token, sequence length distribution, lexical concentration, common-word share, repetition, fallback rate, and downstream latent-skill improvement.
