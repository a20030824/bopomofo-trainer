# Data model and deterministic exercise selection

Status: design record for Issue #46. This document turns the product boundary into a future implementation contract.

## Design invariant

The runtime selection order is fixed:

```text
select transition need
→ retrieve eligible lexical items
→ rank anchor words
→ instantiate reviewed sentence plans
→ validate language and typing budgets
→ rank rendered exercises
→ persist local outcome
```

Commonness is deliberately dominant during the early phase, but it never overrides pronunciation validity, semantic compatibility, or deterministic rejection rules.

## Core records

The examples below are illustrative shapes rather than final TypeScript declarations.

### LexicalItem

```json
{
  "id": "lex:準備",
  "writtenForm": "準備",
  "pronunciationIds": ["pron:準備:zhuyin-1"],
  "commonnessId": "commonness:naer-v1:準備",
  "partOfSpeech": ["verb"],
  "semanticTags": ["preparation", "daily-action"],
  "frameIds": ["frame:subject-prepare-object"],
  "collocationIds": ["collocation:準備-午餐", "collocation:準備-資料"],
  "reviewStatus": "accepted"
}
```

The written form alone is not a stable pronunciation identity. Heteronyms, variants, slash forms, and source aggregation must remain separate until reviewed.

### PronunciationIdentity

```json
{
  "id": "pron:準備:zhuyin-1",
  "lexicalItemId": "lex:準備",
  "reading": ["ㄓㄨㄣˇ", "ㄅㄟˋ"],
  "meaningTags": ["prepare"],
  "sourceEvidence": [],
  "status": "accepted"
}
```

A pronunciation identity is rejected from automatic exercise generation when:

- the reading is missing;
- multiple readings remain unresolved for the intended meaning;
- character-to-syllable alignment is unresolved;
- the form represents multiple lexical items without a reviewed split;
- the reading cannot be mapped under the selected input-method profile.

### TypingProfile

```json
{
  "id": "typing:pron-準備:standard-zhuyin-v1",
  "pronunciationId": "pron:準備:zhuyin-1",
  "inputMethodProfileId": "ime:standard-zhuyin-v1",
  "characterActions": [
    ["ㄓ", "ㄨ", "ㄣ", "tone-3"],
    ["ㄅ", "ㄟ", "tone-4"]
  ],
  "withinSyllableTransitions": [],
  "crossCharacterTransitions": [],
  "physicalFeatures": []
}
```

The actual action vocabulary is defined by the input-method profile. The first tone must not be invented as an explicit key if the profile does not use one.

### CommonnessProfile

```json
{
  "id": "commonness:naer-v1:準備",
  "lexicalItemId": "lex:準備",
  "spokenPerMillion": 0,
  "writtenPerMillion": 0,
  "spokenStrength": 0,
  "writtenStrength": 0,
  "generalReach": 0,
  "crossModeCommonness": 0,
  "confidence": 0,
  "sourceVersion": "naer-v1"
}
```

The null-versus-zero semantics defined by the commonness research remain binding:

- `0` means observed zero under the source definition;
- `null` means missing or unavailable evidence;
- missing evidence is never silently converted into zero.

### SentenceFrame

```json
{
  "id": "frame:time-subject-modal-verb-object",
  "surfaceTemplate": "{time}{subject}{modal}{verb}{object}。",
  "slots": {
    "time": { "semanticTags": ["time-expression"] },
    "subject": { "semanticTags": ["person-or-group"] },
    "modal": { "lexicalSetId": "set:basic-modals" },
    "verb": { "partOfSpeech": ["verb"] },
    "object": { "semanticTags": ["concrete-object", "information"] }
  },
  "constraints": [],
  "reviewStatus": "accepted"
}
```

A frame is not a licence to combine arbitrary matching parts of speech. It must encode or reference semantic restrictions and reviewed collocations.

### CollocationRule

A collocation rule records an accepted or rejected relation between lexical items or semantic classes.

Examples:

- `準備 + 午餐`: accepted;
- `準備 + 資料`: accepted;
- `準備 + 天氣`: rejected for the basic preparation sense;
- `搭 + 捷運`: accepted;
- `喝 + 公車`: rejected.

Rules may be exact lexical pairs, class-level constraints, or reviewed frame-specific restrictions.

### SentencePlan

```json
{
  "id": "plan:prepare-001",
  "frameId": "frame:time-subject-modal-verb-object",
  "slotLexicalItemIds": {
    "time": "lex:明天",
    "subject": "lex:我",
    "modal": "lex:想先",
    "verb": "lex:準備",
    "object": "lex:午餐"
  },
  "anchorLexicalItemIds": ["lex:準備"],
  "targetTransitionIds": [],
  "reviewStatus": "accepted"
}
```

Sentence plans may be pre-reviewed static combinations or deterministically instantiated from a reviewed frame and constrained lexical sets. Both forms must produce the same validation trace.

### RenderedExerciseTrace

```json
{
  "exerciseId": "exercise:session-seed:index",
  "text": "明天我想先準備午餐。",
  "targetTransitionIds": [],
  "anchorLexicalItemIds": ["lex:準備"],
  "sentencePlanId": "plan:prepare-001",
  "scoreComponents": {},
  "targetExposure": {},
  "incidentalDifficulty": {},
  "rejectionHistory": [],
  "assetVersions": {},
  "tieBreakKey": "..."
}
```

## Phase-specific selection priorities

The selector uses a versioned phase profile. The following numbers are proposed starting defaults, not universal linguistic truths.

### Early phase

The early phase prioritises useful language and high-prevalence transitions:

```text
lexical utility =
  0.50 × commonness suitability
+ 0.20 × target transition coverage
+ 0.15 × composability
+ 0.10 × learner familiarity fit
+ 0.05 × freshness
```

Commonness suitability can combine general reach, spoken priority, confidence, and an explicit penalty for specialist-domain skew. Its definition must be versioned.

Hard gates are applied before scoring:

- accepted pronunciation identity;
- accepted lexical review status;
- supported input-method profile;
- commonness evidence above the phase threshold, unless an explicit coverage-gap exception exists;
- permitted frame or collocation path;
- no unresolved heteronym, variant, or segmentation issue.

A hard-gate failure cannot be repaired by a high numerical score.

### Adaptive phase

As local learner evidence becomes reliable, the weights may shift toward measured need:

```text
lexical utility =
  commonness prior
+ target coverage
+ local delay/error need
+ composability
+ spaced-review urgency
- recent repetition
- incidental unfamiliarity
```

The model version and every score component must remain inspectable. Local adaptation does not alter shared language assets.

## Transition need selection

### Cold start

Before learner evidence exists, transition need is based on common language exposure rather than uniform graph coverage.

For each transition:

```text
weighted prevalence =
  sum over eligible lexical items(
    lexical commonness weight
    × occurrence count of transition in the lexical typing profile
  )
```

An initial transition priority can combine:

- weighted prevalence;
- keyboard-position difficulty;
- availability of several natural high-commonness lexical carriers;
- curriculum prerequisites;
- recent session exposure.

A rare transition represented only by obscure words should not outrank common transitions merely because its physical key distance is large.

### With learner history

Local observations may include:

- committed-character latency;
- correction count;
- uncorrected mismatch;
- repeated restart;
- exercise abandonment;
- session recency;
- evidence count and confidence.

Browser limitations must remain explicit. The system observes committed text and composition events; it must not claim exact hidden IME keystroke timing when those events are unavailable.

## Anchor lexical item retrieval

Given one or more target transitions:

1. retrieve lexical items whose typing profiles contain the transition;
2. filter by pronunciation and review gates;
3. filter by early-phase commonness threshold;
4. calculate target occurrence count and transition position;
5. calculate incidental transition burden;
6. calculate composability from available frames and collocations;
7. score candidates with the active phase profile;
8. apply a stable tie-break by lexical ID.

The selector should prefer multiple common carriers across sessions rather than repeat one maximally frequent word indefinitely.

## Lexical recomposition

Sentence construction begins with one or more anchor lexical items selected for training value.

The recomposer then:

1. selects a reviewed frame compatible with every anchor;
2. fills non-anchor slots from phase-appropriate common lexical sets;
3. checks exact and class-level collocation rules;
4. checks semantic type compatibility;
5. checks surface agreement and punctuation rules;
6. derives the complete expected pronunciation and typing profile;
7. evaluates target and incidental transition budgets;
8. emits a candidate sentence plan or a structured rejection.

The non-anchor words are not arbitrary filler. They must be common, reviewed, and simple enough not to hide the intended training target.

## Sentence-level budgets

A sentence candidate is evaluated using both aggregate and worst-case measures.

### Lexical familiarity

Track at least:

- mean commonness strength;
- minimum lexical commonness strength;
- count below the phase threshold;
- count with missing commonness evidence;
- count not previously encountered locally;
- number of lexical items and characters.

An average alone is unsafe because several very common words can hide one obscure word.

### Target exposure

Track:

- occurrences of each target transition;
- whether occurrences are within syllables, across characters, or across words;
- number of anchor lexical items carrying the target;
- target concentration relative to sentence length;
- repeated identical action sequences.

The first implementation should normally aim for one or two primary transitions and a small number of deliberate exposures rather than saturating every word.

### Incidental difficulty

Track:

- unseen or low-confidence transitions;
- unsupported or ambiguous pronunciations;
- punctuation complexity;
- digits or Latin characters;
- sentence length;
- cross-word transition complexity;
- non-target physical difficulty;
- semantic or syntactic complexity flags.

A candidate exceeding a hard phase budget is rejected rather than merely down-ranked.

## Sentence candidate ranking

After hard validation, a candidate sentence can be ranked using:

```text
sentence utility =
  target exposure fit
+ anchor lexical utility
+ whole-sentence commonness
+ frame familiarity
+ naturalness confidence
+ review diversity
- incidental difficulty
- recent sentence similarity
- recent anchor repetition
```

Naturalness confidence must come from reviewed static evidence or a deterministic authoring process. It must not be a runtime model guess.

Recommended tie-break order:

1. higher sentence utility;
2. lower incidental difficulty;
3. higher minimum lexical commonness;
4. lower recent similarity;
5. stable sentence-plan ID;
6. seeded deterministic key when controlled variation is intended.

A seed may vary presentation reproducibly, but it must not replace eligibility and scoring with unbounded randomness.

## Structured rejection reasons

Candidate rejection should be represented by stable machine-readable reasons such as:

- `unresolved_pronunciation_identity`;
- `unsupported_input_method_profile`;
- `commonness_below_phase_threshold`;
- `missing_commonness_evidence`;
- `no_compatible_sentence_frame`;
- `collocation_rejected`;
- `semantic_slot_mismatch`;
- `target_transition_not_preserved`;
- `target_exposure_out_of_budget`;
- `incidental_transition_budget_exceeded`;
- `sentence_length_out_of_budget`;
- `recent_repetition_limit`;
- `naturalness_not_reviewed`;
- `ambiguous_sentence_segmentation`.

A coverage-gap exception must be explicit, for example:

```json
{
  "reason": "coverage_gap_exception",
  "targetTransitionId": "...",
  "commonnessThresholdOverridden": true,
  "reviewStatus": "accepted"
}
```

The exception does not relabel a rare word as common.

## Determinism and offline operation

Given the same:

- static asset versions;
- input-method profile;
- phase profile;
- local learner snapshot;
- recent-history window;
- explicit seed;

selection must produce the same ranked candidates, selected exercise, score trace, and rejection trace.

Runtime generation performs no network calls. Source workbooks, corpora, and optional language-model authoring tools are outside the runtime boundary.

## Local learner state

Suggested local-only records include:

- transition exposure and outcome aggregates;
- lexical encounter history;
- sentence-plan recent history;
- session metrics;
- active input-method profile;
- active phase profile;
- migration version.

The learner can reset or export local state. No account is required.

## First implementation slice

A credible first implementation should remain narrow:

1. support one explicitly named Bopomofo input-method profile;
2. ship a small reviewed common lexical set;
3. derive within-syllable and cross-character transitions;
4. use pre-reviewed frames and collocations;
5. generate short sentences from one anchor word;
6. keep commonness dominant in cold-start selection;
7. store progress locally;
8. provide a debug trace for every exercise;
9. exclude unresolved heteronyms and cross-word targeting;
10. validate deterministic replay in tests.

Cross-word transition targeting, several simultaneous anchors, broader punctuation, and more aggressive learner adaptation should follow only after the lexical and trace contracts are stable.

## Open decisions before implementation

- Which exact Taiwanese Bopomofo IME/layout is the first supported profile?
- How is first-tone commitment represented for that profile?
- Which browser events are considered reliable metrics on each target platform?
- What commonness threshold defines the initial lexical set?
- Are sentence plans fully enumerated, frame-instantiated, or a controlled mixture?
- What review process establishes naturalness confidence?
- How are lexical segmentation and punctuation represented in expected typing text?
- How much repeated target exposure is useful before a sentence becomes artificial?
- Which local metrics have enough evidence to modify the commonness prior?
