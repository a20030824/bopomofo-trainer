# Vision

## Problem

Most typing trainers assume that the prompt character, the semantic unit being learned, and the physical key are the same thing. Bopomofo input has three distinct layers:

1. a Chinese prompt, such as `中文`;
2. a semantic sequence, such as `ㄓ ㄨ ㄥ tone:1 ㄨ ㄣ tone:2`;
3. physical keyboard events, such as `Digit5 KeyJ Slash Space KeyJ KeyP Digit6`.

A useful trainer must preserve these layers instead of collapsing them into one key sequence.

## Product thesis

A Keybr-like focused-token curriculum can be adapted to Bopomofo by replacing generated pseudo-words with reviewed, frequency-banded Chinese words.

The initial learning loop is:

1. estimate performance for each semantic token;
2. select the lowest-confidence token as the current focus;
3. query common reviewed words containing that token;
4. sample with repetition control and modest frequency preference;
5. update the learner profile from input observations.

## First scope

- Traditional Chinese word prompts.
- Explicit Bopomofo readings and all five tones.
- Taiwan Standard Bopomofo physical layout.
- English keyboard mode; no operating-system IME composition.
- Token-level adaptive curriculum.
- Transition observations collected for later analysis.
- Local-first progress storage when a UI is introduced.

## Non-goals for the first version

- Candidate selection or IME prediction quality.
- Accounts, cloud sync, leaderboards, multiplayer, or a backend.
- Mobile soft keyboards.
- Generated pseudo-Bopomofo words.
- A generic plugin platform.
- Transition-aware curriculum before token-only behavior is validated.

## Success criteria

The concept is validated when a headless simulation and later a small interaction prototype show that:

- weak tokens receive substantially more useful exposure;
- common vocabulary remains dominant;
- repetition stays controlled;
- every target syllable has an explicit tone;
- changing physical layouts does not require rebuilding the semantic catalog;
- the training core can run without a UI framework.
