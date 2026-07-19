# Roadmap

## Phase 0 — Architecture baseline

Goal: agree on the product boundary and stable domain language before building interaction code.

Deliverables:

- vision and non-goals;
- Chinese context / semantic token / physical input separation;
- guided versus recall practice-mode distinction;
- layout-scoped skill identity;
- catalog-entry versus exercise distinction;
- module dependency rules;
- Keybr comparison;
- architecture decision records;
- minimal TypeScript type skeleton;
- small provisional word sample.

Exit condition: the repository can clearly answer what is visible, what is semantic, what is layout-specific, what is measured, and what remains experimental.

## Phase 1 — Scheme and catalog feasibility

Goal: compile traceable word readings into semantic catalog entries without prematurely defining final performance scoring.

Deliverables:

- complete Bopomofo and tone token catalog;
- Taiwan Standard Bopomofo layout;
- reading parser for forms such as `ㄓㄨㄥ1 ㄨㄣ2`;
- legal syllable validation;
- catalog provenance and validation;
- coverage report;
- 30–50 provisional entries with explicit status.

Exit condition: invalid readings fail clearly, valid entries compile without physical-key data, and every field can be traced to a source or provisional authoring decision.

## Phase 2 — Human-operated interaction spike

Goal: validate the physical interaction and timing semantics before committing to a metrics model or adaptive curriculum.

Deliverables:

- minimal disposable web page;
- Chinese context plus visible complete Bopomofo reading;
- physical keyboard event adapter using `KeyboardEvent.code`;
- correct handling of all five tones, including first-tone Space;
- several catalog entries per continuous exercise;
- raw observation trace with timestamps and timing contexts;
- explicit error and recovery traces;
- manual event-log export or inspection.

Non-goals:

- polished visual design;
- persistent learner progress;
- adaptive selection;
- final speed or confidence scoring.

Exit condition: real traces clarify where cognitive resets occur, which timing contexts are usable, how errors affect latency, and whether guided Bopomofo input feels coherent.

## Phase 3 — Session and measurement model

Goal: turn findings from the interaction spike into reliable layout-scoped observations and skill estimates.

Deliverables:

- exercise/session state machine;
- entry and syllable boundary handling;
- expected-versus-actual input behavior;
- versioned timing-context inclusion policy;
- explicit binding, confusion, and transition observation decisions;
- exclusion of boundary, recovery, and interaction-noise intervals from motor timing;
- layout- and practice-mode-scoped skill identities;
- deterministic aggregation and provisional smoothing;
- replay CLI for exported spike traces;
- deterministic scripted tests.

Exit condition: scripted and recorded input sequences produce stable, explainable statistics without mixing reading recall, boundary latency, recovery, interaction noise, and within-syllable motor timing.

## Phase 4 — Curriculum simulator

Goal: validate coverage and focused-token selection using the measurement model established in Phase 3.

Deliverables:

- explicit `unobserved`, `sampling`, `eligible`, `focused`, and `cooldown` states;
- baseline coverage phase;
- catalog support and minimum-sample eligibility rules;
- focused binding selection;
- multi-entry exercise builder;
- frequency-band preference;
- repetition control;
- seeded weighted sampling;
- synthetic learner profiles and simulation reports.

Exit condition: simulations show increased exposure for eligible weak bindings without pathological repetition, rare-token domination, or loss of broad coverage.

## Phase 5 — Thin product prototype

Goal: combine validated interaction, measurement, and curriculum behavior into a small usable local-first product.

Deliverables:

- retain Vanilla TypeScript + Vite based on the actual one-page UI complexity;
- curriculum-generated guided exercise display;
- IME-mode warning and explicit first-tone Space behavior;
- cumulative measurement appended only after completed practice rounds;
- schema-versioned, guided/layout-scoped local progress persistence;
- deterministic reload and next-round construction;
- simple completion summary without a confidence/mastery claim;
- deterministic practice/held-out catalog partition;
- periodic held-out evaluation that never updates adaptive training aggregates;
- malformed/stale local state rejection and explicit local reset.

Exit condition: a learner can complete repeated sessions with correct tone handling, persistent layout-scoped progress, adaptive exercise selection, and separate transfer checks on held-out entries.

## Phase 6A — Pilot history and validation instrumentation

Goal: collect enough local, per-round evidence for a real 10–20 round pilot before changing curriculum thresholds or redesigning the full UI.

Deliverables:

- a separate schema-versioned pilot-history store that does not rewrite valid Phase 5 progress;
- migration from existing compact round summaries, with unavailable historical latency represented as `null`;
- retention of at least 20 completed practice/evaluation rounds;
- mapped-key attempts, errors, accuracy, phase, focus, evidence route, timing-sample count, and median clean latency per round;
- reconciliation when progress and pilot-history localStorage writes are temporarily out of sync;
- a restrained, inspectable history table;
- deterministic local JSON export containing policy versions, history, curriculum cooldown metadata, cumulative measurements, and catalog partition IDs;
- no telemetry, account identifier, browser identifier, or learning-effectiveness claim.

Exit condition: a 10–20 round human pilot can inspect coverage-to-focus behavior, cooldown, repetition, and held-out evaluation without altering the adaptive policy or conflating observation with validated learning effect.

## Later experiments

- Phase 6B full UI refinement informed by pilot friction;
- recall practice mode with separate statistics;
- transition-aware curriculum;
- beginner progression by syllable families;
- focused tone practice;
- alternate Bopomofo layouts;
- domain-specific catalogs;
- export/import of local progress;
- richer keyboard and transition visualizations;
- optional accounts only if cross-device demand is demonstrated.
