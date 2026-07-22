# Keybr Reference

This document records ideas studied from the open-source Keybr project and the deliberate differences in this implementation.

Reference repository: `aradzie/keybr.com`.

## Ideas worth retaining

- Compile language content before runtime rather than parsing raw dictionaries in the practice screen.
- Separate keyboard layouts, text input, lesson strategy, statistics, and UI responsibilities.
- Convert a target speed into a per-unit confidence value.
- Focus a lesson on a primary weak unit rather than building an opaque score from many coefficients immediately.
- Keep current and best performance separately.
- Smooth time-to-type estimates and reject implausible timing samples.
- Use weighted randomness and injectable random-number generation.
- Validate lesson results before accepting them into progress statistics.

## Keybr's relevant learning loop

At a high level, guided lessons:

1. maintain performance statistics for each available letter;
2. choose the lowest-confidence available letter;
3. mark it as the focused letter;
4. generate language-like text restricted to available letters and biased toward the focus;
5. update per-letter timing and error statistics after a result.

Its phonetic content model uses character transition frequencies to generate plausible pseudo-words.

## What this project changes

### Visible answer guidance is required for comparable motor measurement

Keybr generally displays the same characters that the learner must type. A Chinese-only prompt would instead require pronunciation recall before physical input, so its latency would not be comparable to Keybr's letter timing.

V1 therefore uses guided mode:

- Chinese vocabulary provides context;
- the complete Bopomofo and tone sequence is visible;
- the measured task is mapping those visible tokens to a selected physical layout.

A later recall mode may hide Bopomofo, but its statistics remain separate.

### Three layers instead of one

This project separates:

- Chinese context prompt;
- semantic Bopomofo and tone sequence;
- physical input code interpreted through a layout.

### Layout-scoped skill instead of bare token skill

Knowing where `ㄥ` is on Taiwan Standard Bopomofo does not imply knowing its position on another layout. The primary V1 skill identity therefore includes practice mode, layout ID, and token ID.

### Reviewed real words instead of pseudo-words

Character-level generation can produce language-like Latin words. Unconstrained Bopomofo generation would frequently produce illegal syllables or meaningless sequences. This project queries a traceable catalog of real Chinese words containing the focus token.

### Catalog entries are not complete lessons

A vocabulary entry remains an atomic content unit, but an exercise may contain several entries. This reduces visual and timing resets after every short Chinese word while preserving word and syllable boundaries.

### Explicit tone tokens

Every syllable ends in one of five semantic tone tokens. First tone is not represented as missing data.

### No per-symbol unlocking in the initial curriculum

Opening a small subset of Latin letters still permits many pseudo-words. Opening a small subset of Bopomofo symbols severely limits legal Chinese vocabulary. The first curriculum begins with a natural-vocabulary coverage phase, then adapts among skills with enough observations and catalog support.

### Richer timing context

Even guided Bopomofo practice has exercise, word, and syllable boundaries. Observations distinguish exercise start, entry start, syllable start, within-syllable movement, and tone completion. These contexts are retained before deciding which samples update confidence.

### Transition data is experimental

Transition observations are collected because Bopomofo syllables have a strong internal structure. However, binding-only confidence remains the first curriculum baseline. Transition-aware selection must demonstrate value through simulation or user testing before becoming default behavior.

## Architecture lesson

Keybr's present repository is a mature full product with many packages and server-side concerns. We adopt its conceptual boundaries, not its current project scale. This repository remains a single lightweight TypeScript application until real requirements justify more infrastructure.

## Validation lesson

A simulator can verify that a sampler emphasizes weak skills without pathological repetition. It cannot verify whether the displayed guidance feels natural, whether Space as first tone behaves coherently, or which timing contexts contain useful motor information.

The first executable artifact is therefore a disposable human-operated interaction spike. The deterministic curriculum simulator follows after measurement semantics are grounded in real traces.

## Clean-room implementation

Keybr is licensed under AGPL-3.0. This project may study public behavior, architecture, and general algorithms, but should not copy source code. Implementations, names, types, tests, and formulas should be written independently and documented here when materially inspired by external work.
