# Roadmap

## Phase 0 — Architecture baseline

Goal: agree on the product boundary and stable domain language before building interaction code.

Deliverables:

- vision and non-goals;
- three-layer prompt/token/physical-input model;
- module dependency rules;
- Keybr comparison;
- architecture decision records;
- minimal TypeScript type skeleton;
- small provisional word sample.

Exit condition: the repository can clearly answer what is semantic, what is layout-specific, what is measured, and what remains experimental.

## Phase 1 — Scheme and catalog

Goal: compile reviewed word readings into semantic training items.

Deliverables:

- complete Bopomofo and tone token catalog;
- Taiwan Standard Bopomofo layout;
- reading parser for forms such as `ㄓㄨㄥ1 ㄨㄣ2`;
- legal syllable validation;
- catalog validation and coverage report;
- 50–100 reviewed sample words.

Exit condition: invalid readings fail clearly and valid entries compile without physical-key data.

## Phase 2 — Curriculum simulator

Goal: validate focused-token selection before a UI exists.

Deliverables:

- token time-to-type and confidence model;
- focus-token selection;
- catalog query by token;
- frequency-band preference;
- repetition control;
- seeded weighted sampling;
- synthetic learner profiles and simulation reports.

Exit condition: simulations show increased weak-token exposure without pathological repetition or loss of broad coverage.

## Phase 3 — Headless session engine

Goal: turn normalized token attempts into reliable observations and learner-profile updates.

Deliverables:

- item/session state machine;
- expected-versus-actual handling;
- timing-context classification;
- token, confusion, and transition observations;
- profile aggregation and smoothing;
- deterministic tests.

Exit condition: scripted input sequences produce stable, explainable metrics.

## Phase 4 — Thin web prototype

Goal: test whether the interaction feels useful.

Deliverables:

- framework choice based on actual UI complexity;
- word and Bopomofo progress display;
- physical keyboard event adapter;
- IME-mode warning;
- local progress persistence;
- simple session summary.

Exit condition: a learner can complete repeated sessions with correct tone handling and persistent progress.

## Later experiments

- transition-aware curriculum;
- beginner progression by syllable families;
- focused tone practice;
- alternate Bopomofo layouts;
- domain-specific catalogs;
- export/import of local progress;
- richer keyboard and transition visualizations.
