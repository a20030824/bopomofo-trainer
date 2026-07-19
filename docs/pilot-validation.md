# Pilot validation

Phase 6A prepares the local-first product for a 10–20 round human pilot. It does not change curriculum thresholds or claim validated learning effectiveness.

## Storage boundary

Phase 5 progress remains the source of truth for cumulative measurement and curriculum state. Pilot history uses a separate schema-versioned localStorage key:

```text
bopomofo-trainer.pilot-history.v1
```

When that key is absent, available Phase 5 round summaries are migrated into pilot history. Older summaries did not preserve per-round latency, so their `cleanLatencyMedianMs` is explicitly `null`.

The two local records are reconciled by round number. Records beyond completed progress are discarded, product summaries can fill a history write that is one round behind, and malformed history falls back to valid summaries.

## Per-round evidence

The latest 24 completed rounds retain:

- sequential round number;
- practice or held-out evaluation kind;
- coverage, adaptive, or evaluation phase;
- focused token and evidence route;
- mapped-key attempts, errors, and accuracy;
- Phase 3 eligible timing-sample count;
- median clean latency;
- completion time and entry IDs.

Mapped-key accuracy includes correct and incorrect mapped key presses at all boundaries. It excludes unmapped, repeat, modifier-only, and IME-composition events.

Median clean latency is calculated only from non-null binding-observation timing values accepted by the Phase 3 policy. It remains separate from user-facing accuracy.

## Pilot export

“下載 Pilot JSON” creates deterministic local JSON containing:

- product and policy versions;
- guided/layout scope;
- compact round history;
- curriculum round and cooldown metadata;
- cumulative measurement aggregates;
- sorted practice and evaluation catalog IDs.

The export omits the random product seed, export time, account data, and any confidence or mastery score. The same state produces byte-for-byte identical output.

## Human pilot protocol

1. Complete 10–20 rounds without clearing progress.
2. Do not tune policy after only one or two rounds.
3. Observe the transition from coverage to adaptive focus.
4. Note whether focused tokens look plausible and whether repetition becomes annoying.
5. Confirm evaluation appears after every five practice rounds.
6. Confirm evaluation rows remain distinct and do not change adaptive measurements.
7. Reload at least twice and verify completed history remains ordered.
8. Download the Pilot JSON and keep qualitative UI notes separately.

Phase 6B should use these observations to refine visual hierarchy and interaction rhythm. Curriculum thresholds should change only after a repeatable failure mode appears in the pilot.
