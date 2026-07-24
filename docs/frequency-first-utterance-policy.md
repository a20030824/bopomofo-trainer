# Frequency-first grammatical utterance policy

## Product decision

The browser product selects complete grammar-valid utterances. It does not first choose a weak relation and then search for arbitrary supporting words, and it never pads a round with unrelated lexical items.

Selection order is:

1. determine the unlocked frequency stage;
2. filter the catalog to entries in that stage;
3. sample a bounded derivation rooted at the formal `Sentence` category;
4. fill each lexical slot only from compatible admitted syntax profiles;
5. give compatible entries and the completed utterance a frequency base;
6. add bounded learner-specific weight from expected-token errors, identifiable binding timing, and exact within-syllable transition timing;
7. apply recent entry and utterance penalties;
8. make one deterministic seeded weighted selection.

## Frequency stages

Three bands continue to control eligibility:

- Stage 1: band 1 only;
- Stage 2: bands 1–2;
- Stage 3: bands 1–3.

A locked band cannot be admitted by a high error or latency score. Stage advancement requires a minimum number of completed practice utterances, enough mapped attempts, and an acceptable cumulative error rate within the current stage.

Within the unlocked set, reviewed NAER `commonness-v1` evidence supplies the entry's frequency weight. The coarse band weight remains the deterministic fallback when an entry has no reviewed commonness projection. This source-neutral boundary does not change the learner-evidence contract.

## Utterance score

For one grammar-valid candidate:

```text
utteranceWeight = frequencyBase
                × boundedLearnerBoost
                × recentEntryFactor
                × recentUtteranceFactor
```

`frequencyBase` is the geometric mean of the versioned frequency weights of the entries in the utterance. Each entry uses its reviewed `commonnessBase.selectionWeight` when available, then falls back to its band weight. The geometric mean avoids automatically rewarding or punishing a candidate merely because it has more words.

The fallback band weights are:

```text
band 1 = 1.00
band 2 = 0.50
band 3 = 0.25
```

The maximum combined learner boost is `1.50`. Stage eligibility is still absolute: no learner boost can admit an entry from a locked band. Inside the unlocked set, learner evidence remains a bounded modifier of the reviewed frequency base.

## Expected-token evidence

A mapped incorrect input updates the binding aggregate of the expected token. The selector may raise utterances containing that expected token after the minimum sample gate.

The actual wrong token is deliberately ignored by curriculum scoring.

Example:

```text
expected ㄓ, actual ㄗ
```

This may raise the weight of utterances containing `ㄓ`. It does not raise `ㄗ`, and it does not create a `ㄓ → ㄗ` practice target. The existing directional confusion aggregate remains available for diagnostics and export only. Confusion observations include mapped incorrect inputs at syllable starts as well as within-syllable and tone positions; this broader diagnostic scope does not change the narrower motor-timing policy.

## Binding timing

Only timing already accepted by the Phase 3 measurement policy can affect selection. Entry starts, syllable starts, recovery input, incorrect input, and interaction-noise-contaminated intervals remain excluded.

For an identifiable token timing aggregate, the selector compares current clean timing to that token's own best clean timing. The contribution is sample-gated and capped.

## Exact transition timing

Transition weight is read only for exact adjacent tokens inside one syllable. No transition is formed across syllable or entry boundaries.

For example, a slow clean `ㄓ → ㄨ` aggregate may raise a grammar-valid utterance containing that exact ordered pair. It does not independently raise every utterance containing `ㄓ` or `ㄨ`.

## Grammar boundary

The production selector requires compact profiles admitted by the full formal
rule index. It cannot bypass slot compatibility to obtain a higher weakness
score, and it has no template, standalone utterance, lexical prompt, or random
word-list fallback. If no complete `Sentence` derivation can be realized, the
round fails closed with explicit reasons.

Caller-supplied template and standalone behavior remains isolated in legacy
compatibility APIs and tests; `product/session.ts` calls only the formal syntax
selector.

## Product catalog boundary

Every syntax-legal runtime entry belongs to the ordinary practice catalog. The browser does not reserve a held-out vocabulary pool or insert automatic evaluation rounds. Research partitions and simulation evaluation remain archived experiment infrastructure and are not part of the browser selection loop.

## Persistence boundary

Product progress schema 4 stores:

- current frequency stage;
- attempts, errors, and completed practice utterances accumulated toward the next stage;
- recent utterance IDs;
- recent template IDs;
- utterance/template/stage fields in recent summaries;
- binding, directional confusion, and exact transition aggregates under measurement policy `phase-3-v2`.

Schemas 1, 2, and 3 are not accepted. The browser deletes their obsolete storage keys before loading the current generation, then starts with fresh measurements, counters, summaries, and selection state. No legacy payload contributes to product or Pilot state.

## Explainability

Every selected utterance retains:

- frequency base;
- expected-token traces and boosts;
- exact-transition traces and boosts;
- combined learner cap;
- repetition factors;
- total weight;
- canonical candidate ordering;
- grammar candidate and fallback identity.

These are selection diagnostics, not claims of learning effectiveness.
