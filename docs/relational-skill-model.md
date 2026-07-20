# Relational skill model

## Thesis

The research object is a graph of Bopomofo keyboard relations derived from reviewed Traditional Chinese text. The browser is only one future source of observations.

## Relation types

### Binding node

Identity: `mode + layoutId + tokenId`.

A binding node represents whether a visible semantic token is mapped to the correct physical key. Its primary evidence is correctness and the distribution of substitutions.

### Transition edge

Identity: `mode + layoutId + fromToken + toToken`.

A transition is directional and occurs only between adjacent tokens inside one syllable. `ㄓ>ㄨ` and `ㄨ>ㄓ` are different edges.

### Confusion edge

Identity: `mode + layoutId + expectedToken + actualToken`.

A confusion is directional. It records which mapped token replaced the expected token, not only that an error occurred.

### Catalog path

Each syllable is an ordered token path. For example, `中` contributes:

```text
ㄓ > ㄨ > ㄥ > tone:1
```

It supplies four binding occurrences and three exact transition occurrences. Physical key codes are resolved from the active layout only when traces are generated.

## Observation semantics

For a clean correct input of `to` after `from`:

- correctness updates the binding node for `to`;
- elapsed inter-key time updates the transition edge `from>to`;
- the same interval is not an independently observed intrinsic speed of `to`.

For an incorrect mapped input:

- the expected binding receives an error;
- `expected>actual` receives a confusion occurrence;
- recovery does not produce clean transition timing.

Exercise, entry, and syllable boundaries remain separate evidence because their latency can include reading, visual relocation, and preparation.

The existing timed-binding aggregate is retained as a reproducible baseline, but relational experiments label it as a destination-token proxy rather than ground-truth token speed.

## Relational catalog index

The compiled catalog must expose occurrence references rather than only token sets. Every reference records entry ID, syllable index, token position, relation identity, frequency band, tags, provenance, and evaluation partition.

The index reports:

- binding and directional-transition occurrence counts;
- distinct supporting entry counts;
- frequency-band distribution;
- concentration in a small number of entries;
- rare, weakly supported, and unsupported relations;
- held-out support;
- candidate contrast pools for confusions.

## Synthetic learner

A synthetic learner contains hidden truth for:

- binding correctness per token;
- directional confusion probabilities;
- transition latency distributions;
- relation-specific improvement rates;
- boundary latency, noise, and recovery as separate parameters.

It traverses selected catalog paths and emits ordinary Phase 3-compatible traces. Curriculum and estimators see only traces; experiment reports compare estimates against hidden truth.

## Strategy families

Objective policies select what needs evidence:

1. frequency-weighted random baseline;
2. binding-only baseline;
3. transition-aware;
4. confusion-aware;
5. combined relational.

The existing Phase 4 selector becomes the binding-only baseline, not the final architecture.

## Numeric evaluation

Reports compare node and edge coverage, estimation error, weakness-identification delay, target exposure lift, held-out path performance, confusion reduction, repetition, catalog concentration, unsupported rates, and stability across seeds and learner cohorts.

Simulation validates internal behavior and identifiability. It does not prove human learning effectiveness.
