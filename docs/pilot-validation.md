# Pilot validation and interface refinement

Phase 6 prepares one coherent local-first product for a 10–20 round human pilot. It adds per-round evidence and refines the practice interface, but it does not change curriculum thresholds or claim validated learning effectiveness.

## Storage boundary

Current-generation product progress remains the source of truth for cumulative measurement and curriculum state. Pilot history uses a separate schema-versioned localStorage key:

```text
bopomofo-trainer.pilot-history.v3
```

The obsolete `bopomofo-trainer.pilot-history.v1` and `bopomofo-trainer.pilot-history.v2` keys are deleted before loading. Their payloads are never parsed or migrated. Pilot-history schema 3 accompanies product-progress schema 4 and measurement policy `phase-3-v2`.

When the current key is absent, current-generation progress summaries can derive a bounded Pilot history fallback. Summaries do not preserve per-round latency, so their `cleanLatencyMedianMs` is explicitly `null`.

The two current-generation local records are reconciled by round number. Records beyond completed progress are discarded, product summaries can fill a history write that is one round behind, and malformed current history falls back to valid current summaries.

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

The primary product is a continuous sentence runway rather than a dashboard of product and research state.

1. One complete Traditional Chinese utterance is the visual unit. Catalog-entry and word boundaries remain in the domain model but are not rendered as cards, gaps, queue rows, or numbered states. Invisible entry wrappers are indivisible line-breaking units, so a reviewed word cannot split across lines.
2. Each displayed character uses a fixed visual step that is independent of reading length. The syllable row reserves four readable symbol positions — initial, medial, final, and tone where present — without compressing token spacing. Shorter syllables remain centered in that same slot.
3. The browser measures every entry at the current rendered font and container width, then uses a deterministic dynamic-programming planner to assign contiguous entry ranges to explicit lines. The planner minimizes ragged unused width and applies a strong penalty to a short single-entry final orphan whenever another legal distribution exists. Lines share one stable left edge, and punctuation remains inside the final entry.
4. Completed, current, and upcoming tokens use restrained ink contrast. The current Bopomofo token receives the persistent accent; the Chinese row does not add a second decorative locator.
5. Wrong-key feedback appears at the current token and in one fixed-height feedback line. Unmapped input remains quiet and does not move layout.
6. IME composition remains blocking, but its warning overlays and dims the stable practice surface instead of increasing feedback height or shifting the sentence and progress line.
7. The primary view retains only the utterance, Bopomofo path, compact round status, a restrained two-pixel progress line, and one numeric position count.
8. Completing the final token persists product progress and Pilot history once, then immediately creates the next round through the existing product transition. There is no completion card, next-round button, mouse action, or timed result gate.
9. The previous round's compact accuracy and clean median remain for at most 1.4 seconds and disappear earlier on the first correct input of the next sentence.
10. Pressing `Escape` opens a keyboard-operable information surface: a right-side drawer on desktop and a bottom sheet on narrow screens. The same key closes the native dialog and restores the hidden keyboard-capture target.
11. Current policy facts, optional physical-key hint, local history, Pilot export, raw traces, diagnostics export, and destructive reset live inside that surface.
12. Desktop and narrow layouts preserve the same hierarchy without visible entry spacing or horizontal scrolling.

The implementation keeps the hidden textarea so real composition events remain observable. Space and Tab are prevented from moving the page only while the practice capture target owns input; controls inside the information surface retain normal keyboard navigation.

## Motion boundary

Motion supports state continuity but never becomes a reward layer:

- the sentence DOM is mounted once per round and existing token/glyph classes update in place;
- initial mount, container resize, and final font availability may reparent the existing entry nodes into newly planned line wrappers without recreating glyph or token nodes;
- token progress uses an 80–90 ms color and underline transition;
- an incorrect current token receives one small horizontal nudge;
- a newly created sentence receives a 150 ms opacity and four-pixel entrance;
- the desktop drawer or narrow-screen sheet uses one restrained entrance transition;
- `prefers-reduced-motion` reduces every transition and animation to an effectively immediate state change.

There are no success bursts, card scaling, staggered character entrances, animated counters, or background motion.

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

1. Complete 10–20 rounds without clearing progress or using the pointer.
2. Confirm the final correct token moves directly to an active next sentence and creates one history record.
3. Hold the final physical key long enough to generate key repeat and confirm the next sentence does not advance.
4. Open and close the information drawer with `Escape`; confirm focus returns to practice and Tab navigation remains inside the surface while open.
5. Toggle the physical-key hint and confirm only the next expected key is exposed.
6. Trigger wrong-key, unmapped-key, and IME states without causing sentence or progress layout shifts.
7. Confirm evaluation appears after every five practice rounds and remains distinct in history without changing adaptive measurements.
8. Reload at least twice and verify completed current-generation history remains ordered and the deterministic next utterance is reproduced.
9. Check one 320 px viewport and one normal desktop viewport. Use a long sentence that would greedily leave one short final entry, and confirm the measured planner moves an earlier entry to produce a more even final line while preserving entry order.
10. Resize across at least one line-break threshold and confirm only entry grouping changes: entered token state, current token, punctuation attachment, and sentence identity remain unchanged.
11. Confirm a four-symbol syllable including its tone remains visibly separated, and that shorter syllables do not change Chinese character spacing.
12. Download the Pilot JSON and one raw round diagnostic; keep qualitative notes on repetition, feedback, and visual friction separately.

Curriculum thresholds should change only after a repeatable failure mode appears in this pilot. UI changes should likewise respond to observed task friction rather than decoration alone.
