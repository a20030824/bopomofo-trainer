# Frequency-first grammatical utterance policy

## Product decision

The browser product selects complete grammar-valid utterances. It does not first choose a weak relation and then search for arbitrary supporting words, and it never pads a round with unrelated lexical items.

Selection order is:

1. determine the unlocked frequency stage;
2. filter the catalog to entries in that stage;
3. enumerate only utterances accepted by the reviewed grammar layer;
4. give every utterance a frequency base;
5. add bounded learner-specific weight from expected-token errors, identifiable binding timing, and exact within-syllable transition timing;
6. apply recent entry, utterance, and template penalties;
7. make one deterministic seeded weighted selection.

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
                × recentTemplateFactor
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

This may raise the weight of utterances containing `ㄓ`. It does not raise `ㄗ`, and it does not create a `ㄓ → ㄗ` practice target. The existing directional confusion aggregate remains available for diagnostics and export only.

## Binding timing

Only timing already accepted by the Phase 3 measurement policy can affect selection. Entry starts, syllable starts, recovery input, incorrect input, and interaction-noise-contaminated intervals remain excluded.

For an identifiable token timing aggregate, the selector compares current clean timing to that token's own best clean timing. The contribution is sample-gated and capped.

## Exact transition timing

Transition weight is read only for exact adjacent tokens inside one syllable. No transition is formed across syllable or entry boundaries.

For example, a slow clean `ㄓ → ㄨ` aggregate may raise a grammar-valid utterance containing that exact ordered pair. It does not independently raise every utterance containing `ㄓ` or `ㄨ`.

## Grammar boundary

The selector receives candidates from `composeGrammarCandidates`. It cannot bypass grammar metadata or templates to obtain a higher weakness score.

Fallback order remains:

1. complete reviewed template;
2. reviewed standalone utterance;
3. reviewed standalone lexical prompt;
4. no candidate with explicit reasons.

There is no fallback to a random word list.

## Evaluation boundary

Held-out evaluation uses only the held-out catalog partition and grammar-valid candidates. It uses no learner-specific boost and never updates cumulative measurements, frequency stage, or recent selection history.

Evaluation observes behavior; it is not a mastery score.

## Persistence boundary

Product progress schema 3 stores:

- current frequency stage;
- attempts, errors, and completed practice utterances accumulated toward the next stage;
- recent utterance IDs;
- recent template IDs;
- utterance/template/stage fields in recent summaries.

Schemas 1 and 2 are not accepted. The browser deletes their obsolete storage key before loading the current generation, then starts with fresh measurements, counters, summaries, and selection state. No legacy payload contributes to product or Pilot state.

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
