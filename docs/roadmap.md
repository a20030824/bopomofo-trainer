# Roadmap

## Completed foundation

### Phase 0 — Architecture baseline

Separated Chinese context, semantic Bopomofo tokens, physical layouts, guided/recall modes, catalog entries, and exercises.

### Phase 1 — Scheme and catalog feasibility

Implemented explicit tones, legal syllable parsing, provenance, validation, and a 49-entry provisional catalog.

### Phase 2 — Interaction spike

Validated Taiwan Standard physical input, first-tone Space, boundaries, errors, recovery, and raw trace semantics.

### Phase 3 — Measurement baseline

Implemented deterministic binding, confusion, and transition observations with explicit boundary, recovery, and noise exclusions.

### Phase 4 — Historical curriculum baseline

Implemented coverage, eligibility, cooldown, seeded sampling, and fixed six-entry exercises. This remains comparison evidence only.

### Phases 5–6 — Browser and pilot adapters

Connected measurement to a local-first browser, held-out evaluation, persistence, pilot history, export, and a focused interface.

### Phase 7 — Relational research archive

Built:

- exact binding/transition catalog analysis;
- deterministic reference importing and manual review queues;
- relation-preserving partitions;
- variable-length relation-targeted composers;
- latent relational learners and ordinary Phase 3 traces;
- a four-axis strategy matrix;
- 750-run / 1,500-round factorial experiments;
- 770-run / 6,160-round candidate confirmation.

Neither candidate survived confirmation. No objective/composer combination was promoted to production. The research system remains reproducible and useful for diagnostics, but it no longer blocks browser product work.

## Completed product phase

### Phase 8 — Frequency-first grammatical practice

#### Phase 8A — Grammar-valid candidate universe

Status: complete.

Delivered:

- complete grammar sidecar coverage for the current catalog;
- reviewed grammatical roles and predicate valency;
- explicit standalone and formulaic utterances;
- deterministic Mandarin templates;
- slot-level frame constraints;
- balanced candidate enumeration;
- fallback from complete template to standalone utterance or lexical prompt;
- build failure for missing, duplicate, inconsistent, or unprovenanced grammar metadata.

Exit condition: every multi-entry practice candidate matches one declared template, and no fallback returns an unrelated word list.

#### Phase 8B — Frequency-first utterance selection

Status: complete.

Product policy:

1. Stage 1 exposes frequency band 1 only.
2. Stage 2 exposes bands 1–2.
3. Stage 3 exposes bands 1–3.
4. Grammar validity is checked before scoring.
5. Frequency remains the dominant base.
6. Expected-token error and accepted binding timing add capped weight.
7. Exact within-syllable transition latency adds capped weight.
8. The actual wrong token and confusion aggregate do not affect selection.
9. Recent entries, utterances, and templates receive transparent penalties.
10. Held-out evaluation remains grammar-valid and never updates training state.

Deliverables:

- versioned policy and complete score traces;
- deterministic seeded selection;
- persisted stage counters and recent utterance/template history;
- schema-1 to schema-2 local progress migration;
- browser presentation of one complete utterance;
- Pilot export of selection policy and stage state;
- regressions for locked stages, bounded boosts, confusion independence, exact transitions, replay, and held-out isolation.

Exit condition: the browser never concatenates independently sampled words, reload reproduces the same next utterance, and exact-head CI is green.

#### Phase 8C — Reviewed commonness data

Status: complete for the active catalog.

Delivered:

- inspect and pin the current NAER workbook schema and checksum;
- implement the smallest source-specific adapter after inspection;
- retain raw spoken/written values and strict null/zero semantics;
- project a versioned general-use base score;
- keep existing frequency bands as fallback;
- do not block on domain breadth, cross-source agreement, or automatic variant splitting.

Exit condition: reviewed commonness evidence can replace coarse frequency bands without importing NAER-specific types into curriculum code.

## Current product phase

### Phase 9 — Reviewed lexicon expansion and human validation

The next constraint is no longer selection architecture. It is catalog size and the absence of human evidence. The catalog has grown across several activation waves (49 → 114 → 291 → 321 entries) using the committed NAER top-1,000 queue, in bounded review batches.

#### Phase 9A — Rank-ordered catalog expansion

Status: in progress; the review-rigor policy below changed partway through.

The first waves reviewed every candidate by hand: accept one evidenced lexical identity and reading, or record an explicit exclusion reason; review lexical role, standalone/formulaic status, and predicate valency; retain source and decision provenance; measure added grammar-candidate variety before merging.

Product decision (this changed the rule below): later waves explicitly traded manual grammar review for lexicon growth speed. `scripts/auto_classify_activation_batch.py` approves grammar roles directly from UD evidence with no per-word human review, and separately, CC-CEDICT heteronyms (words with more than one valid reading) are activated with every distinct reading as its own entry rather than picking one — see `docs/reference-sources/cedict-local-identity-hints.md`. Both carry an accepted, unmeasured error rate with no planned correction pass. A word's own identity/reading resolution (which authority a word's Bopomofo comes from) still fails closed on ambiguity; only the *grammar role* assignment and *heteronym reading inclusion* steps were loosened.

Exit condition: the full top-1,000 queue has a complete include/exclude ledger, every included entry passes the existing catalog and grammar gates, and the browser's candidate universe shows materially lower repetition than the original 49-entry baseline.

#### Phase 9B — Local human pilot

Run short, repeatable guided-mode sessions only after the first expansion tranche is browser-verified. Record task completion, wrong-key recovery, IME friction, hint usage, repetition complaints, and local diagnostic exports. Treat accuracy and latency as observations, not a mastery score.

Exit condition: observed friction is reproducible across sessions, the default flow can be completed without developer assistance, and any proposed threshold or UI change cites a concrete pilot failure mode.

#### Phase 9C — Evidence-based product refinement

Only after Phase 9B:

- reevaluate PR #18 auto-advance against utterance boundaries;
- review stage thresholds from real local pilot data;
- improve sentence variety without runtime LLM generation;
- consider recall mode and alternate layouts as separate measurement scopes.

Accounts, backend, telemetry, cloud sync, and learning-effectiveness claims remain out of scope.

## Guardrails

- Word meaning and semantics are forbidden inputs throughout catalog
  processing, grammar annotation, composition, selection, validation, and
  evaluation. No definition, sense, semantic role, plausibility judgment,
  world knowledge, embedding, language model, or semantic proxy may filter,
  rank, repair, or reject a candidate. Only non-semantic form, frequency, and
  syntactic evidence may be used; unresolved cases retain every otherwise
  valid form or fail closed rather than being resolved by meaning.
- Frequency eligibility cannot be bypassed by a weakness score.
- Part of speech alone is insufficient; predicate frame remains explicit.
- Formulaic utterances cannot fill ordinary subject/predicate/object slots.
- Transitions never cross syllable or entry boundaries.
- Confusion remains diagnostic unless a future product decision explicitly changes that boundary.
- Evaluation never updates cumulative practice measurements or stage state.
- External reference candidates never enter the reviewed catalog automatically.
- Simulation does not prove human learning effectiveness.
