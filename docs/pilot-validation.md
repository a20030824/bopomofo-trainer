# Pilot validation and interface refinement

Phase 6 prepares one coherent local-first product for a 10–20 round human pilot. It adds per-round evidence and refines the practice interface, but it does not change curriculum thresholds or claim validated learning effectiveness.

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

## Interface hierarchy

The refined product UI follows the measured task rather than presenting every system detail with equal weight:

1. the current Chinese entry and its complete Bopomofo reading are the primary surface;
2. the current token is stronger than completed and upcoming tokens;
3. wrong-key feedback appears both on the current token and beside the active entry;
4. the six-entry order remains visible as a compact queue;
5. completion metrics and the next-round action form one continuous result panel;
6. pilot history uses expandable rows, with evaluation visually distinct;
7. raw traces, diagnostics export, and destructive reset remain outside the primary flow.

Desktop and mobile layouts preserve the same hierarchy. The mobile version stacks the current entry, queue, summary, and history instead of compressing the desktop grid.

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
8. Confirm wrong-key, unmapped-key, IME, hint, completion, and next-round states remain visually clear.
9. Check one narrow/mobile viewport and one normal desktop viewport.
10. Download the Pilot JSON and keep qualitative notes on repetition, feedback, and visual friction separately.

Curriculum thresholds should change only after a repeatable failure mode appears in this pilot. UI changes after Phase 6 should likewise respond to observed friction rather than decoration alone.
