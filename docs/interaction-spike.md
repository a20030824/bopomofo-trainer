# Guided interaction measurement spike

## Purpose

This page is a disposable instrument for observing guided Bopomofo keyboard interaction. It is not the product UI and does not create learner confidence, speed scores, or permanent progress.

The page consumes a generated TypeScript module containing semantic `CatalogEntry` values. CSV and provenance parsing remain a build-time concern; the browser does not re-parse source data.

## Run

```bash
npm install
npm run dev
```

The `predev` hook compiles ten provisional catalog entries into the ignored file `src/app/generated/catalog.ts` before Vite starts. The selected entries must contain at least two words and all five explicit tones or generation fails.

Use an English keyboard mode. The physical layout is Taiwan Standard Bopomofo, and Space represents the explicit first-tone token. The expected physical key hint is off by default and can be toggled during comparison runs; its state is included in downloaded JSON.

A persistent, visually hidden textarea remains focused as the browser input target. This allows English keydown, Space, and real IME composition events to be observed through the same target without making the visible exercise editable. Its transient value is cleared and never stored.

## Current interaction semantics

- Correct mapped input advances exactly one semantic token.
- Incorrect mapped input and ordinary unmapped keys are traced as errors and do not advance.
- Held-key repeats are traced as `ignored-repeat` and do not count as errors.
- Modifier-only keys and Ctrl/Alt/Meta shortcuts are traced as `ignored-modifier` and do not count as errors.
- Composition events and `Process` key events are traced as `composition`, show an IME warning, and do not advance.
- The focused capture target absorbs Space, so first-tone input does not scroll the page.
- Timing uses monotonic `performance.now()` timestamps.
- `elapsedSinceAdvanceMs` is measured from the previous successful advance. Errors do not reset that clock, so a later successful correction includes the entire recovery interval and is marked `recovery: true`.
- The first target uses the interval from exercise creation or reset and is classified as `exercise-start`.

## Trace fields

Each attempt records:

- exercise and entry identity;
- global token position plus entry, syllable, and token indexes;
- expected and actual semantic token;
- physical `KeyboardEvent.code`;
- context (`exercise-start`, `entry-start`, `syllable-start`, `within-syllable`, or `tone`);
- outcome, correctness, advancement, and recovery;
- repeat, composition, and modifier flags;
- monotonic timestamp and elapsed time since the previous successful advance.

The page displays the latest 100 rows and can download the full exercise and trace as JSON.

## Implementation findings

- `CatalogEntry` and `Exercise` are meaningfully different: several entries can remain visually separated while sharing one uninterrupted token cursor.
- Tone tokens need explicit visual marks. First tone is rendered as `ˉ`, never as an invisible absence.
- Ignored browser events must remain distinguishable from motor errors; a nullable `correct` field and explicit `outcome` avoid mixing them.
- Error recovery cannot be represented by a single per-token latency without a policy decision. The spike therefore retains the full attempt sequence and flags the successful recovery event.
- Browser keyboard normalization belongs outside the headless session reducer. The reducer only receives normalized semantic input and event flags.
- Always showing a physical key hint could change the task from memory retrieval to visual copying, so the spike defaults it off and records whether it was enabled.
- Composition detection is more credible with a persistent editable capture target than with document-level key listeners on a non-editable page.

## Manual observation protocol

Run at least three short passes. Click **開始／重新計時** immediately before each pass:

1. normal English-mode input with physical hints off;
2. intentional mapped errors, unmapped keys, and held keys;
3. IME enabled long enough to trigger composition detection.

Optionally repeat the first pass with physical hints enabled.

For each pass, note:

- whether Chinese plus complete Bopomofo is easy to scan;
- whether entry cards interrupt or support continuous rhythm;
- whether first-tone Space feels like part of the syllable;
- whether entry-start and syllable-start pauses look cognitively distinct;
- whether recovery duration should update later motor statistics;
- whether showing the expected physical code changes user behaviour too much.

## Unresolved measurement questions

- Should `exercise-start` ever update a motor skill model, or remain diagnostic only?
- Should `entry-start` and `syllable-start` be modeled separately after more observations?
- Should a correct recovery attempt retain the full elapsed interval, exclude error-handling time, or produce two derived values?
- Should ordinary unmapped keys count as motor errors, interaction noise, or a separate class?
- Should shortcut-modified mapped keys be completely absent from analytical traces?
- How long should one continuous exercise be before fatigue or reading layout dominates the measurement?
- Does exposing the expected physical key create visual dependence and distort the intended training task?

No answer is committed in this phase. The exported raw trace exists so those policies can be decided from observed sessions rather than architecture speculation.
