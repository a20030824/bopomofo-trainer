# Relational partition policy

## Status

Phase 7B3 research policy. This document compares deterministic catalog partition strategies; it does not define browser behavior or claim human learning effectiveness.

Tracking issue: #26.

## Problem

A reviewed catalog must be split into disjoint training and evaluation entries. Evaluation should retain unfamiliar lexical paths, but a held-out entry must not silently remove all training evidence for a binding or directional transition that the experiment expects the learner to acquire.

The current product partition protects token-level raw, binding, and motor contexts. On the 49-entry catalog it leaves three exact transitions in evaluation only:

- `ㄎ → ㄜ`;
- `ㄜ → tone:3`;
- `ㄩ → ㄥ`.

This is valid baseline behavior, not a defect to hide. The research question is whether alternative numeric policies produce a more useful transfer/evaluation boundary.

## Contract

Every strategy accepts the same shared inputs:

- `CatalogEntry[]`;
- `CatalogRelationIndex`;
- `RelationalCatalogReport`;
- frequency bands, tags, and provenance IDs carried by catalog entries.

Every strategy returns one replayable `PartitionDecision`:

```ts
interface PartitionDecision {
  readonly trainingEntryIds: readonly string[];
  readonly evaluationEntryIds: readonly string[];
  readonly policyId: string;
  readonly seed: number | null;
  readonly metrics: PartitionMetrics;
  readonly constraintResults: readonly PartitionConstraintResult[];
  readonly selectionTrace: readonly PartitionSelectionTrace[];
  readonly fallbackReasons: readonly PartitionFallbackReason[];
}
```

Entry IDs in the final partitions are sorted. Selection order remains in `selectionTrace`. Seeded policies serialize the seed and deterministic tie-break score.

## Invariants

1. An entry belongs to exactly one partition.
2. Duplicate entry IDs are rejected.
3. Relation support uses distinct entry IDs; occurrence count alone never satisfies a support constraint.
4. Exact transitions remain directional and within one syllable.
5. Every candidate selection or rejection records a reason code.
6. Every stop, fallback, and unsatisfied constraint is machine-readable.
7. Hard constraints are never silently weakened.
8. No policy depends on JavaScript object iteration order.
9. Equal inputs and seed produce byte-for-byte equal JSON output.

## Shared metrics

All strategies use the same evaluator. It reports:

- training and evaluation entry counts;
- observed binding and transition coverage in each partition;
- evaluation-only binding and transition keys;
- globally unsupported relation counts after rebuilding the report;
- minimum and median training distinct-entry support over observed relations;
- average and maximum training relation concentration;
- total-variation divergence between training and evaluation frequency bands;
- token and exact-transition Jaccard overlap;
- Han-character and tag Jaccard overlap;
- evaluation novelty, defined transparently from relation, token, character, and tag non-overlap;
- explicit unsatisfied constraints.

Cross-seed comparison reports evaluation-set Jaccard stability, per-entry selection rates, and unique decision digests.

## Strategy family

### Binding-preserving baseline

Reproduces the current product algorithm without importing product behavior into the research result. Candidates are ordered by frequency band and stable entry ID. A candidate is held out only if raw-token, binding-context, and motor-context distinct-entry support remains at `min(original support, configured minimum)`.

This baseline deliberately does not protect exact directional transitions.

### Relation-support preserving

Holds out entries only while every observed binding and transition retains the configured minimum number of distinct training entries. Relations with fewer original supporting entries require all original support to stay in training when the configured minimum is larger than their support.

### Frequency-stratified

Computes deterministic evaluation quotas proportional to the catalog frequency-band distribution using largest remainders. It attempts each band quota while applying the same relation-support guard. Unfilled soft band quotas may use an explicitly traced cross-band fallback; exact evaluation size and relation support remain hard constraints.

### Seeded maximum-coverage held-out

Greedily maximizes newly represented evaluation bindings and transitions while preserving training support. Equal coverage scores are resolved by a stable hash of `seed + entry ID`; the hash and score components are serialized in the trace.

### Path-novelty

Greedily favors evaluation entries whose ordered syllable paths, exact transition set, Han characters, tags, and provenance differ from already selected evaluation entries. The strategy still applies the same training-support guard, so lexical novelty cannot silently create an unknown-relation test.

## Constraint semantics

The default relation guard preserves at least one distinct training entry for every observed relation. A higher threshold may be configured. For a relation with original support below the threshold, required support is the original support; the policy cannot fabricate additional support.

`evaluation-entry-count` is hard. When no legal candidate remains, the policy returns a partial deterministic split with:

- an unsatisfied hard constraint result;
- a `no-legal-candidate` stop trace;
- an explicit `evaluation-target-unmet` fallback reason.

It does not lower the relation-support threshold.

## Research interpretation

Two evaluation regimes must remain distinguishable:

1. unfamiliar entries carrying relations also supported in training — transfer to novel lexical paths;
2. entries carrying relations absent from training — unknown-relation diagnosis.

The relation-support-preserving strategies implement the first regime. The baseline exposes how the second regime can occur accidentally. A future experiment may intentionally request unknown relations, but it must label them rather than treating them as ordinary held-out transfer.

Relations supported by only one entry cannot be both trained and held out without adding data or changing the experiment. Relations supported by two entries can support a one-entry hold-out only when one training example is considered sufficient. These are feasibility facts, not threshold recommendations.

A fixed partition supports direct comparison across simulation seeds. Seed-varying partitions estimate sensitivity to catalog split choice but add another experimental factor. Reports therefore preserve partition seed separately from learner seed.

When frequency and relation support conflict, relation support is hard by default and frequency quota is soft with an explicit fallback. A separate experiment may invert that priority, but must use a distinct policy ID.

## Reverse-review checklist

Before handoff, inspect:

- data contamination between training and evaluation IDs;
- hidden dependence on original entry order or object key order;
- occurrence counts mistaken for distinct-entry support;
- transitions crossing syllable or entry boundaries;
- unrecorded threshold relaxation;
- seed or tie-break information omitted from output;
- metrics computed by different evaluators per strategy;
- abstractions introduced before a second concrete use exists.
