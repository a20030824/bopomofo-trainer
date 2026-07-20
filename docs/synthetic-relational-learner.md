# Synthetic relational learner

## Purpose

The synthetic relational learner supplies known hidden truth for binding correctness, directional confusion, directional within-syllable transition latency, boundary latency, recovery, learning, retention, and interaction noise. It emits ordinary `InteractionTrace` values by calling the existing interaction session functions. The traces then pass through `deriveMeasurementDecisions` and `aggregateMeasurements` under a supplied `MeasurementPolicy`.

The simulator never writes `BindingAggregate`, `TransitionAggregate`, or `ConfusionAggregate` values directly. Hidden truth is unavailable to the measurement functions and is read only afterward to calculate estimation error.

## Contract boundary

Inputs are:

- an existing semantic `Exercise`, used as the current complete target-sequence contract until a shared `PracticeSequence` is introduced;
- an `InputLayout` that maps physical codes to semantic tokens;
- an existing `MeasurementPolicy`;
- `SyntheticLearnerState`;
- an integer seed, a deterministic start timestamp, and optional abstract retention steps.

`Exercise` is intentionally used rather than inventing a parallel shared sequence type. The generator consumes every semantic token and preserves entry, syllable, and token positions through the existing `flattenExercise` and `applyInteractionInput` path.

Outputs are:

- `SyntheticLearnerState` before and after exposure;
- `SyntheticTraceBatch`;
- `LatentTruthSnapshot`;
- `ExposureUpdate`;
- `MeasurementEstimate`;
- `EstimationErrorReport`;
- `DeterminismDigest`.

## Hidden truth

### Binding truth

Each token declares:

- total first-attempt mapped-error probability;
- a deterministic fallback substitution for error probability not assigned to a named confusion;
- an optional boundary-only response adjustment;
- learning rate;
- decay rate per abstract retention step.

There is no independent destination-token motor speed. Boundary response adjustment is used only at exercise, entry, or syllable starts.

### Transition truth

A transition is identified by the directional pair `[fromToken, toToken]`. Explicit transition truth contains a positive latency distribution, learning rate, decay rate, and an optional list of explicit transfer targets.

An undeclared transition uses `defaultTransitionLatency` and records `default-transition-fallback`. Because it has no declared latent relation to update, `ExposureUpdate.skipped` records `undeclared-transition-fallback-has-no-latent-update`.

Transfer cannot diffuse through token similarity or graph proximity. It occurs only for listed target transition keys with a bounded factor.

### Confusion truth

Generation avoids double-counting by using two stages:

1. sample the token's total binding-error probability once;
2. only after an error, sample the directional named-confusion distribution conditional on that error.

Named substitutions for one expected token may sum to at most one. Remaining conditional mass uses the binding's explicit fallback substitution. A named `expected -> actual` edge does not create or modify the reverse edge.

### Context and noise truth

Context truth contains log-normal latency distributions for:

- exercise start;
- entry start;
- syllable start;
- undeclared transitions;
- recovery.

Noise truth contains one categorical interaction-noise opportunity per target:

- unmapped input;
- held repeat;
- composition interruption;
- no noise as the residual probability.

Session and observation latency scales are sampled separately. Noise is emitted before the mapped attempt and remains visible in raw traces. The Phase 3 policy decides that the following interval is interaction-noise contaminated.

## Latency distribution

Positive latency uses a log-normal distribution parameterized by arithmetic mean and standard deviation. It was selected because latency cannot be negative and human-like timing commonly has a right tail. Zero standard deviation is a deterministic point mass and supports exact fixtures.

The current experiment does not claim that log-normal timing is the correct human model. Distribution choice is an explicit synthetic-model seam.

## Generation order

For each semantic target, the generator performs this fixed sequence:

1. select exercise, entry, syllable, explicit-transition, or default-transition timing truth;
2. sample session-scaled and observation-scaled latency;
3. optionally emit one interaction-noise trace;
4. sample the token's total binding error once;
5. on error, sample a conditional named confusion or use the explicit generic fallback;
6. emit the ordinary mapped attempt through `applyInteractionInput`;
7. after a mapped error, emit a correct recovery attempt after the recovery delay;
8. retain target-level generation reasons and trace sequence numbers;
9. after the whole batch is generated, derive and aggregate Phase 3 measurements;
10. update latent state from semantic exposures, then apply optional retention decay.

Updating after the batch keeps all traces in one batch comparable to the same `before` truth. Sequential within-batch learning is a separate possible experiment, not an implicit behavior.

## Learning and retention

Learning is exposure-based rather than estimator-based. The default credit is:

- correct first attempt: `1.0` binding and transition credit;
- recovered mapped error: `0.5` binding/confusion credit and `0.25` transition credit;
- no declared transition truth: no latent transition update, with an explicit skip reason.

Confusion learning decreases named conditional substitution mass. It does not silently change total binding-error probability; binding learning owns that quantity. Residual conditional mass therefore flows to the declared generic fallback rather than being renormalized back into the named edge.

Decay is applied only when the caller supplies integer `retentionSteps`. It is not inferred from wall-clock time, round number, or timestamps. Binding error moves toward one, transition mean and variance increase, and named-confusion probability moves upward subject to a per-expected-token probability cap. Any cap normalization records `confusion-decay-probability-cap`.

## Measurement estimates

`MeasurementEstimate.aggregate` is the unmodified Phase 3 aggregate. Additional estimates are computed from Phase 3 decisions and raw traces:

- binding first-attempt error rate excludes the correct recovery observation from its denominator;
- conditional confusion rate divides a directional confusion count by eligible mapped errors for that expected token;
- transition mean uses only included Phase 3 transition observations;
- boundary means are diagnostic clean-boundary means from raw traces and are not motor-transition aggregates.

The historical binding aggregate still contains a destination-token timing proxy because Phase 3 retains it. The synthetic model does not interpret that value as an independently identifiable token speed and does not add another destination-token latency to generated intervals.

`EstimationErrorReport` compares estimates against the `before` truth that generated the batch. Missing eligible observations remain `insufficient-samples` rather than being converted to zero.

## Machine-readable reasons

The output retains reasons for:

- timing source and default-transition fallback;
- noise selection;
- correct response, named confusion, and generic error fallback;
- layout code selection (`lexicographically-first-layout-code`);
- every Phase 3 binding, confusion, and transition exclusion;
- exposure, partial credit, explicit transfer, and decay;
- undeclared-transition update skips;
- sequence completion or empty-sequence stopping;
- relation-key and digest canonicalization order.

No locale-sensitive sorting participates in replay or digest generation.

## Determinism

`Mulberry32Random` is seeded by an integer. All categorical traversal and record serialization use direct code-unit ordering. `DeterminismDigest` applies FNV-1a 32-bit hashing to recursively key-sorted serialized output.

The digest is a replay identity, not a cryptographic integrity claim.

## Required scenarios

`createSyntheticScenarios` and `data/fixtures/simulation/scenario-manifest.json` define:

1. one weak binding;
2. one weak directional transition;
3. asymmetric `ㄅ -> ㄆ` confusion;
4. competing weaknesses;
5. high interaction noise;
6. fast but inaccurate behavior;
7. slow but accurate behavior;
8. zero learning;
9. exposure followed by retention decay.

## Validation

The tests verify:

- exact traces for zero error, zero noise, and zero variance;
- isolated `ㄓ -> ㄨ` latency in the transition estimate with normal binding correctness;
- no automatic `ㄆ -> ㄅ` confusion from `ㄅ -> ㄆ`;
- recovery timing exclusion;
- no cross-syllable transition;
- identical traces, Phase 3 aggregates, and digest for identical scenarios and seeds;
- unchanged relation truth under zero learning;
- separate exposure and decay reasons;
- Monte Carlo convergence for binding error, conditional confusion, and transition mean without exact random snapshots.

## Non-goals

This module does not select text, choose curriculum objectives, compare composers, implement UI, or claim human validity. The fixture vocabulary is synthetic and exists only to exercise relational measurement behavior.
