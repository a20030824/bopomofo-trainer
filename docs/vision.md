# Vision

## Problem

Most typing trainers assume that the prompt character, the semantic unit being learned, and the physical key are the same thing. Bopomofo input has three distinct layers:

1. a Chinese context prompt, such as `中文`;
2. a semantic sequence, such as `ㄓ ㄨ ㄥ tone:1 ㄨ ㄣ tone:2`;
3. physical keyboard events, such as `Digit5 KeyJ Slash Space KeyJ KeyP Digit6`.

A useful trainer must preserve these layers instead of collapsing them into one key sequence.

## Product thesis

The first product is guided motor training for a specific Bopomofo keyboard layout. It shows both the Chinese context and the complete Bopomofo reading, including every tone, then measures how fluently the learner maps those visible semantic tokens to physical keys.

This deliberately avoids treating reading recall and keyboard fluency as the same skill.

The initial learning loop is:

1. show reviewed Chinese vocabulary together with its explicit Bopomofo reading;
2. measure layout-scoped performance for each token binding;
3. select one eligible low-confidence binding as the current focus;
4. build a short continuous exercise from common catalog entries containing that token;
5. update the learner profile from context-aware input observations.

## Practice modes

### Guided mode — V1

- Chinese context is visible.
- Complete Bopomofo and tone sequence is visible.
- Performance represents symbol-to-key mapping and motor execution for the selected layout.

### Recall mode — later experiment

- Chinese context is visible.
- Bopomofo is hidden or progressively revealed.
- Performance also includes pronunciation recall and must not be merged directly with guided-mode statistics.

## First scope

- Traditional Chinese words and short phrases as context.
- Explicit Bopomofo readings and all five tones.
- Taiwan Standard Bopomofo physical layout.
- English keyboard mode; no operating-system IME composition.
- Guided practice mode only.
- Layout-scoped token-binding statistics.
- Transition observations collected for later analysis.
- Local-first progress storage when a product UI is introduced.

## Non-goals for the first version

- Testing whether the learner can recall a word's pronunciation from Chinese alone.
- Candidate selection or IME prediction quality.
- Accounts, cloud sync, leaderboards, multiplayer, or a backend.
- Mobile soft keyboards.
- Generated pseudo-Bopomofo words.
- A generic input-method plugin platform.
- Transition-aware curriculum before token-only behavior is validated.

## Validation layers

### Technical correctness

- Every syllable has an explicit tone token.
- Readings, layouts, and catalog provenance are validated.
- Deterministic tests reproduce session and sampling behavior.

### Curriculum behavior

- Eligible weak bindings receive more exposure.
- Common vocabulary remains dominant.
- Repetition stays controlled.
- Non-focused bindings retain broad coverage.

### Learning usefulness

- Repeated practice improves speed or accuracy on held-out words containing the same target binding.
- Improvement is not limited to memorizing a small set of repeated words.
- Learners report that the guided interaction is clearer and more useful than undirected random practice.

A headless simulation can validate curriculum behavior, but only a human-operated interaction spike can validate timing semantics and interaction usefulness.