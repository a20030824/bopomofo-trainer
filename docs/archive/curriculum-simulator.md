# Phase 4 curriculum simulator

## Purpose

The Phase 4 simulator is a headless experiment for validating curriculum behavior before adaptive selection is connected to the browser UI or persisted as learner progress. It consumes semantic catalog entries and Phase 3 binding aggregates; physical key codes never enter curriculum logic.

The simulator does not produce a validated confidence or learning score. Every state, evidence route, focus decision, candidate weight, fallback, and generated exercise remains inspectable.

## Run

```bash
npm run curriculum:simulate
npm run curriculum:simulate -- --seed review --rounds 20
```

The command compiles the current catalog in memory and emits JSON reports for the standard synthetic scenarios.

## Why eligibility has two evidence routes

Phase 3 excludes `syllable-start` latency from motor timing while retaining its binding correctness. Most Bopomofo initials always occur at syllable start, so requiring clean timing samples from every token would make many initials permanently ineligible.

Phase 4 therefore distinguishes:

- `timed`: the catalog contains enough entries where the token occurs in `within-syllable` or `tone` position; eligibility requires attempts, clean timing samples, and motor-support entries;
- `correctness-only`: the token has enough measurable binding occurrences at later syllable starts but insufficient motor positions; eligibility uses attempts, errors, and binding-support entries without inventing timing.

A token that appears only as the first token of an entry has neither route, because Phase 3 treats exercise and entry starts as diagnostic only.

## Binding states

| State | Meaning |
| --- | --- |
| `unobserved` | No binding observations exist yet. |
| `sampling` | Some data exists, but measurement or catalog-support thresholds are not met. |
| `eligible` | The binding qualifies through either timed or correctness-only evidence. |
| `focused` | The binding was selected for the current round. |
| `cooldown` | It was recently focused and is temporarily suppressed. |

The default `phase-4-v1` policy requires eight attempts and three distinct binding-support entries. Timed evidence additionally requires five clean timing samples and three motor-support entries. An unsupported rare binding can therefore be observed and slow while remaining `sampling`; it is never confused with `unobserved` or allowed to dominate focus selection.

## Coverage and adaptive phases

A new learner begins in baseline coverage. Supported Bopomofo bindings target three attempts and tone bindings target four. Coverage ranking uses normalized exposure deficit, then favors tokens with common binding-support entries. This prevents a rare token with one obscure entry from controlling the opening exercises.

After coverage deficits are resolved, eligible non-cooldown bindings compete for focus. The provisional weakness score exposes its evidence and components.

For timed evidence:

```text
errorRate = errors / attempts
timingRatio = currentTime / maximum currentTime among timed eligible candidates
score = (0.6 × errorRate + 0.4 × timingRatio) / 1.0
```

For correctness-only evidence, `timingRatio` is `null`, the timing component is omitted, and the denominator is renormalized to the error component. This score is only a deterministic ordering heuristic for simulation. It is not confidence, mastery, or evidence of learning.

## Exercise weighting

A generated exercise contains six distinct catalog entries by default. When focus exists, the builder aims for half of the entries to provide the selected evidence:

- timed focus uses entries with a motor-eligible occurrence;
- correctness-only focus uses entries with a later syllable-start binding occurrence.

Every weighted choice reports:

- frequency-band weight: `1.0`, `0.6`, or `0.3` for bands 1–3;
- focused-entry boost: `3.0` when the entry supports focus;
- recent-entry penalty: `0.15`;
- recent-token overlap penalty: `0.85` per overlapping token;
- final multiplicative weight;
- selected entry and candidate pool.

The builder avoids duplicate entries within an exercise. When a focused token has fewer candidates than requested, it falls back to general entries and records `focus-support-limited` rather than repeating the same word pathologically.

## Reports

Each round records:

- state, reason, and evidence route for every supported binding;
- state transitions;
- coverage or adaptive phase;
- focus candidates and score components;
- generated entry IDs;
- raw token exposure;
- Phase 3 binding-observation exposure;
- motor-timing-eligible exposure;
- frequency-band distribution;
- repetition count against the preceding round;
- fallback reasons;
- full weighted-pick traces.

Separating the three exposure channels prevents an entry-boundary token from silently increasing simulated attempts or timing samples.

The simulator uses a seeded random source with explicit 32-bit state wrapping. Identical catalog, profile, policy, scenario, and seed produce byte-for-byte identical reports and the same deterministic digest. Numeric seed zero remains distinct from other seeds.

## Standard scenarios

1. completely new learner;
2. one clearly weak eligible common binding;
3. a rare weak binding with insufficient catalog support;
4. multiple similarly weak bindings competing for focus;
5. cooldown preventing immediate refocus;
6. the same scenario run twice to verify byte-for-byte determinism.

## Limitations

Synthetic sessions update aggregates with fixed scenario performance and simple random errors. Binding-only occurrences update attempts and errors but never timing. Motor occurrences create a clean timing sample only when the synthetic attempt is correct, matching the Phase 3 separation of correctness and motor timing.

The simulator still does not model real fatigue, outliers, persistence, transition-aware focus, recall-mode sharing, or validated learning outcomes. The correctness-only route also does not claim that error rate alone is an optimal teaching signal; it only avoids fabricating unavailable latency data.
