# Relational research integration

## Purpose

This integration proves that the four Phase 7 research modules can be connected without collapsing their boundaries or introducing a new curriculum strategy.

It is a deterministic single-policy integration fixture, not the relational strategy matrix or multi-cohort experiment harness.

## Reference boundary

```text
hand-authored source bytes
  → tabular reference adapter
  → normalized reference candidate or structured row error
  → relational contribution ranking
  → manual review queue
```

The integration report records `approvalBoundary: manual-review-required` and `reviewedCatalogMutation: none`.

Reference candidates never enter the reviewed catalog automatically. The integration deliberately stops at the review queue, preserving the grammar, external-reference, and reviewed-catalog layers as separate universes.

## Reviewed-catalog pipeline

```text
reviewed catalog
  → canonical relational catalog report
  → relation-support-preserving partition decision
  → training/evaluation relation report
  → exact transition objective retrieval
  → budgeted variable-length PracticeSequence
  → synthetic learner raw InteractionTrace values
  → existing Phase 3 derive/aggregate measurement
  → estimation error against pre-exposure latent truth
```

The composer receives the partitioned relation index and the complete reviewed catalog. Evaluation occurrences remain visible to retrieval only as explicit `evaluation-partition` exclusions; they cannot be selected for training.

The practice sequence is converted to the existing semantic `Exercise` contract without adding physical key codes. The synthetic learner then emits ordinary traces through the existing interaction-session state machine. Hidden truth is read only after Phase 3 measurement for the estimation-error report.

## Fixture

The committed fixture uses:

- one accepted novel reference row and one unresolved pronunciation row;
- five hand-authored reviewed catalog entries using the synthetic Taiwan layout subset;
- one evaluation entry selected by `relation-support-preserving-v1`;
- one explicit `ㄓ → ㄨ` transition objective;
- `greedy-marginal-gain` composition with a one-exposure budget;
- the existing `weak-transition` synthetic learner scenario;
- fixed composition and learner seeds and a fixed start timestamp.

The fixture contains no copied official source data and uses `example.invalid` provenance.

## Report

`runRelationalResearchIntegration()` returns one machine-readable report containing:

- the importer result and review queue;
- the partition decision, constraints, fallbacks, metrics, and partitioned report;
- the variable-length practice sequence, retrieval exclusions, selection trace, budget usage, fallbacks, and stop reason;
- raw traces, Phase 3 measurement decisions and aggregates, latent before/after truth, exposure updates, estimation error, and the learner digest;
- an outer deterministic digest covering the complete integration report.

The serializer recursively orders object keys while preserving array order. Identical fixtures, versions, policies, seeds, scenario, and start timestamp must produce byte-for-byte identical output.

## Commands

Verify the committed fixture twice and compare the serialized reports:

```bash
npm run integration:research
```

Write the canonical report for inspection:

```bash
npx tsx scripts/run-relational-integration.ts --verify --output /tmp/relational-integration.json
```

## Non-goals

This integration does not:

- approve reference candidates;
- add or choose a new curriculum objective policy;
- compare multiple objective or composition strategies;
- run multiple seeds or learner cohorts;
- claim human learning validity;
- modify the browser or resume the paused auto-advance work.

The strategy matrix and experiment harness remain separate follow-up phases after this integration gate is reviewed.
