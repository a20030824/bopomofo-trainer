# Relational strategy matrix

## Purpose

The relational strategy matrix declares which replaceable research components may be compared after the Phase 7 integration checkpoint.

It is a stable experiment design contract. It does not execute learner cohorts, choose seeds, aggregate statistics, or claim that every declared strategy is already implemented.

## Four replaceable axes

### Objective selector

The objective selector receives the current relation report, Phase 3 measurement summary, recent objective history, mode/layout scope, round number, and seeded random source. It returns an `ObjectiveDecision` with candidate scores and fallback reasons.

Declared objective strategy IDs:

1. `frequency-random`
2. `binding-only-baseline`
3. `transition-aware`
4. `confusion-aware`
5. `combined-relational`

### Partition policy

The partition policy receives reviewed catalog entries and a canonical relational report. It returns a `PartitionDecision` with selected training/evaluation entries, hard/soft constraints, fallbacks, selection trace, metrics, and deterministic digest.

Declared partition policy IDs:

1. `binding-preserving-baseline-v1`
2. `relation-support-preserving-v1`
3. `frequency-stratified-v1`
4. `seeded-maximum-coverage-v1`
5. `path-novelty-v1`

### Composer

The composer receives an explicit `RelationObjective`, the partitioned relation index, reviewed entries, history, practice budget, beam width, and seeded random source. Its strategy adapter supplies the composition strategy ID and returns a variable-length `PracticeSequence`.

Declared composition strategy IDs:

1. `fixed-six-baseline`
2. `greedy-marginal-gain`
3. `greedy-gain-per-token`
4. `diversity-aware-greedy`
5. `bounded-beam-search`

### Learner model

The learner model receives a practice sequence, latent learner state, physical layout, Phase 3 measurement policy, scenario identity, seed, fixed timestamp, and retention steps. It returns an ordinary trace batch with measurement and estimation-error reports.

The currently declared model is `synthetic-relational-v1`. Additional learner models may be registered later without changing the other axes.

## Matrix cells

`createRelationalStrategyMatrix()` builds the complete Cartesian product in canonical order:

```text
5 objective selectors
× 5 partition policies
× 5 composers
× 1 learner model
= 125 declared cells
```

Each cell contains only four strategy identities and a stable cell ID. A cell deliberately does not contain:

- seed;
- learner scenario;
- cohort identity;
- round count;
- metric result;
- confidence interval;
- failure rate.

Those are execution dimensions and outputs owned by the later experiment harness.

## Baseline

The explicit historical baseline cell is:

```text
binding-only-baseline
+ binding-preserving-baseline-v1
+ fixed-six-baseline
+ synthetic-relational-v1
```

The matrix constructor rejects custom subsets that remove this baseline. Comparisons therefore cannot silently redefine the baseline after results are produced.

## Replaceable interfaces

The matrix module exports four adapter interfaces:

- `ObjectiveSelectorStrategy`
- `PartitionSelectorStrategy`
- `PracticeComposerStrategy`
- `LearnerModelStrategy`

The adapter ID must match its declared axis. Implementations may close over policy-specific configuration, but the simulator must receive adapters rather than hard-code a single objective, partition, composer, or learner path.

## Determinism

Axis input order is canonicalized before cells are generated. Duplicate IDs, unknown built-in strategies, blank learner IDs, and baseline-free subsets are rejected.

The complete declaration has a deterministic digest and canonical serializer. Reversing the supplied axis arrays must produce byte-for-byte identical output.

## Command

Print the canonical matrix:

```bash
npm run strategy:matrix
```

Verify that reversed axis input produces the same serialized matrix:

```bash
npx tsx scripts/print-relational-strategy-matrix.ts --verify
```

## Boundary to the experiment harness

The next `agent/relational-experiment-harness` phase will bind matrix cells to:

- multiple seeds;
- learner scenarios and cohorts;
- repeated rounds;
- JSON, CSV, and Markdown result reports;
- aggregate metrics and stability descriptions;
- failure and fallback rates.

This matrix phase does not run those experiments and does not resume PR #18, browser auto-advance, UI work, or human pilot work.
