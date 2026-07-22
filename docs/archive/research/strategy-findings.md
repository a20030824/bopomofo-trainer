# Relational strategy findings

- Source plan: `relational-cohort-v1`
- Source report digest: `cddf2d38`
- Analysis policy: `phase-7g-v2`
- Analysis digest: `da68b959`
- Baseline cell: `["strategy-cell","binding-only-baseline","binding-preserving-baseline-v1","fixed-six-baseline","synthetic-relational-v1"]`
- Maximum blocking fallback rate: 0.2500

Bootstrap objective fallbacks remain in the raw fallback totals and clusters, but the versioned policy does not treat the declared round-zero codes as blocking candidate evidence.

## Recommendation counts

- Candidate: 2
- Inconclusive: 5
- Rejected: 368
- Zero executable rounds: 0

| Scenario | Candidate | Inconclusive | Rejected |
|---|---:|---:|---:|
| asymmetric-confusion | 1 | 2 | 122 |
| weak-binding | 1 | 1 | 123 |
| weak-transition | 0 | 2 | 123 |

## Candidate cells

- **asymmetric-confusion** — `frequency-random` / `binding-preserving-baseline-v1` / `fixed-six-baseline` / `synthetic-relational-v1`; blocking fallback 0; material-improvement:weaknessIdentificationDelayRounds
- **weak-binding** — `binding-only-baseline` / `relation-support-preserving-v1` / `fixed-six-baseline` / `synthetic-relational-v1`; blocking fallback 0.2500; material-improvement:bindingEstimateMeanAbsoluteError

## Global failure clusters

No failure cluster was recorded.

## Global fallback clusters

- `objective:combined-includes-support-driven-round-zero-demand` — 150 rounds across 150 runs.
- `objective:round-zero-frequency-support-sampling` — 150 rounds across 150 runs.
- `objective:round-zero-support-driven-binding` — 150 rounds across 150 runs.
- `objective:round-zero-support-driven-confusion` — 150 rounds across 150 runs.
- `objective:round-zero-support-driven-transition` — 150 rounds across 150 runs.
- `objective:combined-includes-unmeasured-support-driven-demand` — 141 rounds across 141 runs.
- `objective:unmeasured-support-driven-confusion` — 141 rounds across 141 runs.
- `objective:unmeasured-support-driven-binding` — 116 rounds across 116 runs.

## Balanced axis overview

| Axis | Level | Balanced | Total fallback | Blocking fallback | Failure | Weakness delay | Coverage | Cost/improvement |
|---|---|---|---:|---:|---:|---:|---:|---:|
| composition | `bounded-beam-search` | yes | 0.7933 | 0.2933 | 0 | 0.1455 | 0.2253 | 39.0227 |
| composition | `diversity-aware-greedy` | yes | 0.7667 | 0.2667 | 0 | 0.1532 | 0.2240 | 39.4504 |
| composition | `fixed-six-baseline` | yes | 0.7467 | 0.2467 | 0 | 0.1441 | 0.2193 | 39.8001 |
| composition | `greedy-gain-per-token` | yes | 0.7600 | 0.2600 | 0 | 0.1770 | 0.2253 | 40.2095 |
| composition | `greedy-marginal-gain` | yes | 0.7600 | 0.2600 | 0 | 0.2105 | 0.2227 | 40.2860 |
| learner | `synthetic-relational-v1` | yes | 0.7653 | 0.2653 | 0 | 0.1664 | 0.2233 | 39.7538 |
| objective | `binding-only-baseline` | yes | 0.8867 | 0.3867 | 0 | 0.5652 | 0.1980 | 38.0098 |
| objective | `combined-relational` | yes | 0.9700 | 0.4700 | 0 | 0 | 0.4647 | 38.2801 |
| objective | `confusion-aware` | yes | 0.9700 | 0.4700 | 0 | 0 | 0.1000 | 42.5406 |
| objective | `frequency-random` | yes | 0.5000 | 0 | 0 | 0.2979 | 0.1867 | 42.2720 |
| objective | `transition-aware` | yes | 0.5000 | 0 | 0 | 0 | 0.1673 | 37.6663 |
| partition | `binding-preserving-baseline-v1` | yes | 0.7667 | 0.2667 | 0 | 0.1696 | 0.2240 | 40.0025 |
| partition | `frequency-stratified-v1` | yes | 0.7667 | 0.2667 | 0 | 0.1826 | 0.2247 | 40.0609 |
| partition | `path-novelty-v1` | yes | 0.7567 | 0.2567 | 0 | 0.1468 | 0.2247 | 39.4637 |
| partition | `relation-support-preserving-v1` | yes | 0.7867 | 0.2867 | 0 | 0.1712 | 0.2227 | 39.6676 |
| partition | `seeded-maximum-coverage-v1` | yes | 0.7500 | 0.2500 | 0 | 0.1607 | 0.2207 | 39.5740 |

## Interpretation boundary

- Synthetic strategy comparisons do not establish human learning effectiveness.
- Candidate means policy-compatible for this committed cohort, not a production recommendation.
- Axis summaries are descriptive factorial averages and are not causal effect estimates.
- All fallback rounds remain visible; only versioned round-zero bootstrap codes are non-blocking for candidate guardrails.
- Null metrics and failed runs remain visible and are never dropped from guardrails.
- Descriptive normal intervals are not inferential evidence for a human population.
