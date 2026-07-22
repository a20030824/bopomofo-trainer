# Relational strategy confirmation

- Plan: `relational-confirmatory-v1`
- Plan digest: `cc6a4706`
- Source report digest: `cddf2d38`
- Source analysis digest: `da68b959`
- Source findings policy: `phase-7g-v2`
- Confirmation policy: `phase-7h-v2`
- Baseline cell: `["strategy-cell","binding-only-baseline","binding-preserving-baseline-v1","fixed-six-baseline","synthetic-relational-v1"]`
- Report digest: `8d937f8f`
- Runs: 770
- Adaptive rounds: 6160

## Scenario decision counts

- Survives confirmation: 0
- Scenario limited: 1
- Inconclusive: 7
- Rejected: 69

## Seed assessment counts

- Pass: 21
- No material improvement: 0
- Missing evidence: 10
- Rejected: 669

## Phase 7G candidate survival by scenario

| Scenario | Candidate hypothesis | Anchor | Passing seeds | Rejected seeds | Decision |
|---|---|---|---:|---:|---|
| asymmetric-confusion | `phase-7g-weak-binding-candidate` | no | 2/10 | 7/10 | rejected |
| asymmetric-confusion | `phase-7g-asymmetric-confusion-candidate` | yes | 0/10 | 10/10 | rejected |
| competing-weaknesses | `phase-7g-weak-binding-candidate` | no | 0/10 | 10/10 | rejected |
| competing-weaknesses | `phase-7g-asymmetric-confusion-candidate` | no | 0/10 | 8/10 | rejected |
| heterogeneous-improvement | `phase-7g-weak-binding-candidate` | no | 0/10 | 10/10 | rejected |
| heterogeneous-improvement | `phase-7g-asymmetric-confusion-candidate` | no | 0/10 | 8/10 | rejected |
| high-noise | `phase-7g-weak-binding-candidate` | no | 1/10 | 9/10 | rejected |
| high-noise | `phase-7g-asymmetric-confusion-candidate` | no | 2/10 | 8/10 | rejected |
| retention-decay | `phase-7g-weak-binding-candidate` | no | 0/10 | 10/10 | rejected |
| retention-decay | `phase-7g-asymmetric-confusion-candidate` | no | 2/10 | 8/10 | rejected |
| weak-binding | `phase-7g-weak-binding-candidate` | yes | 3/10 | 7/10 | rejected |
| weak-binding | `phase-7g-asymmetric-confusion-candidate` | no | 1/10 | 8/10 | rejected |
| weak-transition | `phase-7g-weak-binding-candidate` | no | 0/10 | 10/10 | rejected |
| weak-transition | `phase-7g-asymmetric-confusion-candidate` | no | 5/10 | 5/10 | scenario-limited |

## Hypothesis decisions

| Hypothesis | Anchor scenarios | Robust scenarios | Decision | Reasons |
|---|---|---:|---|---|
| `asymmetric-confusion-composer-ablation:bounded-beam-search` | asymmetric-confusion | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `asymmetric-confusion-composer-ablation:diversity-aware-greedy` | asymmetric-confusion | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `asymmetric-confusion-composer-ablation:greedy-gain-per-token` | asymmetric-confusion | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `historical-baseline` | — | 0/7 | inconclusive | historical-baseline-reference |
| `phase-7g-asymmetric-confusion-candidate` | asymmetric-confusion | 1/6 | rejected | anchor-scenario-rejected; robust-scenarios:1/6 |
| `phase-7g-weak-binding-candidate` | weak-binding | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `transition-aware-versus-asymmetric-candidate-objective` | weak-transition | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `transition-aware-versus-weak-binding-candidate-objective` | weak-transition | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `weak-binding-composer-ablation:bounded-beam-search` | weak-binding | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `weak-binding-composer-ablation:diversity-aware-greedy` | weak-binding | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |
| `weak-binding-composer-ablation:greedy-gain-per-token` | weak-binding | 0/6 | rejected | anchor-scenario-rejected; robust-scenarios:0/6 |

## Material trajectory reversals

- `trajectory-reversal:bindingEstimateMeanAbsoluteError` — 88 seed/scenario assessments.
- `trajectory-reversal:confusionEstimateMeanAbsoluteError` — 7 seed/scenario assessments.
- `trajectory-reversal:transitionEstimateMeanAbsoluteErrorMs` — 49 seed/scenario assessments.

## Interpretation boundary

- Synthetic confirmation does not establish human learning effectiveness.
- Survives-confirmation means robust under this declared cohort and versioned policy only.
- Compact trajectories omit raw trace events while preserving objectives, outcomes, errors, failures, and fallbacks.
- Matched ablations are interpretable only when exactly one declared strategy axis changes.
- Trajectory reversal checks cover cumulative binding, transition, and confusion estimation error; other metrics remain final-aggregate evidence.
- Browser/UI work, auto-advance, and human pilot remain deferred.

## Machine-readable evidence

The JSON, seed-assessment CSV, survival CSV, and trajectory CSV retain every seed and adaptive round. This document intentionally summarizes decisions rather than ranking cells with one score.
