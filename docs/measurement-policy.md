# Phase 3 measurement policy

## Purpose

Phase 3 converts raw `InteractionTrace` values into deterministic observations and aggregates. It does not claim to produce a final learning score, typing speed, or confidence value.

The policy is versioned as `phase-3-v1` and lives in `src/measurement/policy.ts`. UI code does not decide which samples are valid.

## Context policy

| Context | Binding correctness | Motor timing | Transition timing |
| --- | --- | --- | --- |
| `exercise-start` | diagnostic only | excluded | excluded |
| `entry-start` | diagnostic only | excluded | excluded |
| `syllable-start` | included | excluded | excluded |
| `within-syllable` | included | eligible | eligible |
| `tone` | included | eligible | eligible |

The first key of an exercise or entry includes reading and orientation latency. The first key of a later syllable still contributes a binding correctness observation, but its timing remains separated from within-syllable motor timing.

## Event policy

- Correct mapped, non-recovery input in `within-syllable` or `tone` may produce binding and transition timing.
- Incorrect mapped input in a motor-eligible context produces a binding error and expected-to-actual confusion observation.
- A correct key after a mapped error is retained as a binding completion, marked as recovery, and excluded from timing.
- Unmapped keys are interaction noise. They do not create a binding or confusion observation and do not start recovery.
- Repeats, modifier shortcuts, and composition events are also interaction noise rather than motor errors.
- Any interaction noise between two successful advances invalidates the later timing interval. The later correct binding remains recorded, but its timing and transition are excluded as `interaction-noise`.
- Transitions require a previous token and a nonzero token index. They therefore cannot cross exercise, entry, or syllable boundaries.

Every raw trace receives an explicit included or excluded decision for the binding, confusion, and transition channels. Exclusions retain a machine-readable reason.

## Skill identity

Binding identity is:

```text
practice mode + layout ID + expected token
```

Confusion identity adds the actual token. Transition identity uses the previous and current token. Guided and recall modes, or two layouts, never share aggregates implicitly.

## Aggregation

Binding aggregates currently retain:

- attempts;
- errors;
- eligible timing sample count;
- current provisional time-to-type;
- best eligible time-to-type;
- counts of timing exclusions caused by syllable starts, incorrect input, recovery, and interaction noise.

Confusions count expected-to-actual occurrences. Transitions retain eligible sample count, current provisional timing, and best timing.

The provisional current timing is an exponential moving average:

```text
new = previous + alpha × (sample - previous)
```

`alpha` is currently `0.25`, is validated, and is deliberately configurable. The first eligible sample initializes the estimate. Values are rounded to three decimal places for stable serialized output.

This is smoothing, not confidence. Minimum samples, outlier treatment, confidence normalization, and curriculum eligibility remain Phase 4 decisions.

Aggregate keys are sorted with direct code-unit comparison rather than locale-sensitive collation so serialized output remains stable across environments.

## Replaying exported traces

The interaction spike's downloaded JSON can be analyzed without opening the browser:

```bash
npm run measurement:analyze -- path/to/bopomofo-spike.json
```

The command prints the policy, every per-trace decision, and the aggregate summary as JSON.

## What this model can claim

It can explain exactly why a raw event did or did not affect a binding, confusion, transition, or timing aggregate. Replaying the same exercise and traces produces the same output.

It cannot yet claim that:

- the smoothing parameter is optimal;
- the aggregate predicts learning;
- boundary correctness should influence curriculum;
- recovery time should be discarded permanently;
- unmapped input is always irrelevant;
- transition timing is useful enough to drive selection;
- two skill estimates are comparable before minimum-sample rules exist.

Those questions remain explicit rather than being hidden inside a score.
