# Phase 5 thin product prototype

## Purpose

Phase 5 connects the validated interaction, measurement, and curriculum modules into a small browser product. It is deliberately local-first and single-page. It does not add accounts, backend infrastructure, recall practice, cross-layout transfer, or a final confidence/mastery score.

## Framework decision

The prototype stays on Vanilla TypeScript + Vite. The actual UI has one route, one keyboard capture target, one active exercise, and a small number of controls. Moving to a component framework would add migration cost before the product has demonstrated routing, reusable component, or complex asynchronous-state requirements.

The domain loop remains independent of the DOM. A later framework can call the same pure product functions.

## Product loop

1. Load schema-versioned local progress, or create a clean guided `zhuyin-standard` profile.
2. Select coverage or adaptive focus using the Phase 4 curriculum policy.
3. Build a deterministic continuous multi-entry exercise from the practice catalog.
4. Collect physical-key traces through the existing `KeyboardEvent.code` adapter.
5. Derive Phase 3 binding, confusion, and transition decisions.
6. Append eligible observations to cumulative measurements.
7. Update curriculum round, cooldown, and recent-entry/token metadata exactly once.
8. Save progress and show a simple round summary.
9. Deterministically construct the next round from the saved state.

## Persistence boundary

`localStorage` uses `bopomofo-trainer.progress.v1`. Persisted state includes:

- schema version;
- product seed;
- guided mode and layout ID;
- measurement-policy and curriculum-policy versions;
- cumulative binding, confusion, and transition aggregates;
- curriculum round, recent entries/tokens, and per-token last-focused round;
- completed practice and evaluation counts;
- up to twelve compact recent round summaries.

Measurement aggregates are the cumulative source of truth. Curriculum binding aggregates are rebuilt from them on load; only curriculum metadata is independently persisted. This prevents two stored copies of the same statistics from drifting apart.

Malformed JSON, missing fields, duplicate canonical aggregate scopes, wrong layout/mode, stale schema/policy versions, impossible counters, or unknown practice entries/tokens reject the entire stored value. The product then starts from a clean profile instead of partially trusting it.

## Measurement accumulation

`aggregateMeasurements` accepts an optional previous summary. New decisions are appended in trace order, preserving the exact Phase 3 EWMA sequence and all exclusion counters. Appending across measurement-policy versions is rejected.

A completed practice exercise updates cumulative measurements. A held-out evaluation exercise creates an isolated per-round summary only.

## Held-out evaluation

The generated browser catalog is deterministically split into practice and evaluation partitions. Five entries are reserved only when removing them preserves each token's existing practice support up to the Phase 4 minimum of three entries. Practice therefore keeps full token and tone coverage without unnecessarily turning supported bindings into rare ones.

After every five completed practice rounds, the next round uses three held-out entries. Evaluation:

- uses the same guided interaction and Phase 3 measurement semantics;
- reports attempts, errors, and clean timing samples;
- does not update cumulative training measurements;
- does not change coverage, focus, cooldown, or recent practice entries;
- remains held out on later adaptive rounds.

This is a transfer check, not a validated learning assessment.

## Browser behavior

The page keeps the proven hidden textarea capture target so IME composition events remain observable. Space and Tab are prevented from moving the page while active input is expected. The IME warning remains latched until manually cleared or the user starts another round.

The primary UI shows:

- round type, curriculum phase, and explainable focus evidence;
- active entry and token;
- overall token progress;
- optional physical-key hints;
- completion accuracy, valid attempts, and clean timing count;
- local progress reset;
- raw trace diagnostics under a collapsed disclosure.

No UI element labels the provisional weakness heuristic as confidence or mastery.

## Known limitations

- Progress is browser-local and has no export/import workflow yet.
- Evaluation uses a small provisional 49-entry catalog.
- A reload resets the unfinished round's timing trace, although the deterministic exercise and saved cumulative progress are restored.
- There is no fatigue model, outlier policy, transition-aware curriculum, recall mode, or cross-device synchronization.
