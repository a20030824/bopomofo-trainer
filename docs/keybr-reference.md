# Keybr Reference

This document records ideas studied from the open-source Keybr project and the deliberate differences in this implementation.

Reference repository: `aradzie/keybr.com`.

## Ideas worth retaining

- Compile language content before runtime rather than parsing raw dictionaries in the practice screen.
- Separate keyboard layouts, text input, lesson strategy, statistics, and UI responsibilities.
- Convert a target speed into a per-token confidence value.
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

### Three layers instead of one

Keybr generally displays and expects the same character sequence. This project separates:

- Chinese prompt;
- semantic Bopomofo and tone sequence;
- physical input code interpreted through a layout.

### Reviewed real words instead of pseudo-words

Character-level generation can produce language-like Latin words. Unconstrained Bopomofo generation would frequently produce illegal syllables or meaningless sequences. This project queries a reviewed catalog of real Chinese words containing the focus token.

### Explicit tone tokens

Every syllable ends in one of five semantic tone tokens. First tone is not represented as missing data.

### No per-symbol unlocking in the initial curriculum

Opening a small subset of Latin letters still permits many pseudo-words. Opening a small subset of Bopomofo symbols severely limits legal Chinese vocabulary. The first curriculum keeps all tokens available and changes focus through sampling.

### Richer timing context

The first token after a Chinese prompt includes reading and pronunciation-retrieval time. Observations distinguish prompt start, syllable start, within-syllable movement, and tone completion.

### Transition data is experimental

Transition observations are collected because Bopomofo syllables have a strong internal structure. However, token-only confidence remains the first curriculum baseline. Transition-aware selection must demonstrate value through simulation or user testing before becoming default behavior.

## Architecture lesson

Keybr's present repository is a mature full product with many packages and server-side concerns. We adopt its conceptual boundaries, not its current project scale. This repository remains a single lightweight TypeScript application until real requirements justify more infrastructure.

## Clean-room implementation

Keybr is licensed under AGPL-3.0. This project may study public behavior, architecture, and general algorithms, but should not copy source code. Implementations, names, types, tests, and formulas should be written independently and documented here when materially inspired by external work.
