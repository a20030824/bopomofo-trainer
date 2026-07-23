# Local-first browser product

## Purpose

The browser connects reviewed catalog data, grammar-valid utterance composition, Phase 3 measurement, frequency-first selection, local persistence, held-out evaluation, and Pilot diagnostics.

It remains a single-page Vanilla TypeScript + Vite product with no account, backend, cloud sync, recall mode, cross-layout transfer, or mastery score.

## Product loop

1. Delete obsolete local progress generations, then load only the current schema.
2. Determine the current frequency stage.
3. Filter practice entries to unlocked frequency bands.
4. Enumerate only grammar-valid utterance candidates.
5. Score complete utterances using a dominant frequency base, bounded expected-token evidence, exact within-syllable transition evidence, and recent-selection penalties.
6. Select one utterance deterministically from the versioned seeded distribution.
7. Collect physical-key traces through the existing `KeyboardEvent.code` adapter.
8. Derive Phase 3 binding, confusion, and transition decisions.
9. Append eligible practice observations once; evaluation remains isolated.
10. Update frequency-stage counters and recent utterance/template history once.
11. Save progress, Pilot history, and a compact summary.
12. Reproduce the same next utterance after reload.

The browser never independently selects several words and concatenates them. One exercise is the ordered entry sequence of one grammar candidate.

## Selection boundary

Frequency controls eligibility and the dominant base score:

- Stage 1: band 1;
- Stage 2: bands 1–2;
- Stage 3: bands 1–3.

Learner evidence is sample-gated and capped. A weakness score cannot unlock a lower-frequency entry.

A mapped error raises only the expected token. The actual wrong token is retained in the confusion diagnostic channel but is not read by the curriculum selector.

Exact transition weight is computed only from adjacent tokens inside one syllable.

## Grammar boundary

All active product entries require reviewed grammar annotations. Candidate composition records:

- utterance ID;
- template ID or standalone fallback kind;
- ordered entry IDs;
- slot assignments;
- display text and punctuation;
- fallback reasons.

Fallback order is complete template, standalone utterance, standalone lexical prompt, then explicit failure. There is no random-word fallback.

## Persistence boundary

Product progress uses `bopomofo-trainer.progress.v3` with payload schema version 3. Pilot history uses `bopomofo-trainer.pilot-history.v2` with payload schema version 2.

Persisted state includes:

- product seed, mode, and layout;
- measurement, curriculum-diagnostic, and utterance-policy versions;
- cumulative binding, confusion, and transition aggregates;
- current frequency stage and stage attempts/errors/rounds;
- recent utterance and template IDs;
- completed practice and evaluation counts;
- up to twelve recent summaries with utterance, template, and stage identity.

Older progress and Pilot history generations are deliberately incompatible. Their storage keys are deleted before current-generation loading, and their payloads are never parsed, migrated, merged, or partially trusted.

Malformed JSON, invalid aggregate scopes, stale policy versions, impossible counters, or unknown catalog references reject the stored value rather than partially trusting it.

## Measurement accumulation

Practice observations append to cumulative measurements in trace order. The Phase 3 inclusion/exclusion rules remain unchanged.

- binding correctness belongs to the expected token;
- accepted binding timing may inform a capped token boost;
- clean within-syllable timing belongs to a directed transition;
- confusion remains a separate diagnostic aggregate;
- entry starts, syllable starts, recovery, incorrect timing, and interaction-noise timing remain excluded where declared by Phase 3.

## Held-out evaluation

The catalog remains split into disjoint practice and evaluation partitions while preserving practice token support.

After every five practice utterances, evaluation:

- uses only held-out entries in the currently unlocked frequency stage;
- composes a grammar-valid utterance;
- uses no learner-specific selection boost or recent history;
- records attempts, errors, and clean timing for the round summary;
- does not update cumulative measurements, frequency stage, recent utterances, recent templates, or curriculum diagnostics.

This is an observation adapter, not a validated learning assessment.

## Browser behavior

The page keeps the hidden textarea capture target so real IME composition events remain observable. Space and Tab are prevented from moving the page while active input is expected.

The primary UI shows:

- the complete utterance before its individual words;
- current frequency stage and selection boundary;
- sentence-template or standalone type;
- active word and complete Bopomofo reading;
- current token and optional physical-key hint;
- overall utterance progress;
- completion accuracy, mapped attempts, and clean timing count;
- local history and Pilot export;
- raw diagnostics under a collapsed disclosure.

No UI element labels error/timing evidence as confidence, mastery, or learning effectiveness.

## Known limitations

- The current catalog and grammar review are small and provisional.
- Grammar templates ensure declared structure, not semantic naturalness.
- Coarse frequency bands remain until reviewed NAER commonness evidence is imported.
- Reload resets unfinished-round timing traces, although completed current-generation progress and deterministic next selection persist.
- There is no fatigue model, timing-outlier policy, recall mode, alternate layout, account, or cross-device synchronization.
