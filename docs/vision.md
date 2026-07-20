# Vision

## Problem

Most typing trainers assume that the prompt, the learned unit, and the physical key are the same thing. Bopomofo practice has distinct layers:

1. Chinese context, such as `中文`;
2. an ordered semantic path, such as `ㄓ ㄨ ㄥ tone:1 | ㄨ ㄣ tone:2`;
3. a physical layout mapping, such as `Digit5 KeyJ Slash Space | KeyJ KeyP Digit6`;
4. learner relations over bindings, transitions, and directional confusions.

A useful research environment must preserve all four layers and retain the exact text occurrences that provide evidence for each relation.

## Research thesis

The project studies how reviewed Traditional Chinese text can be indexed and composed to expose Bopomofo keyboard relations, and how different curriculum strategies behave against synthetic learners with known latent skill.

The core structures are:

- binding nodes: visible token to layout-specific key correctness;
- transition edges: directional clean movement between adjacent tokens inside one syllable;
- confusion edges: directional expected-to-actual substitutions;
- catalog paths: ordered text-derived token sequences that support those relations.

The browser interaction is one observation adapter. It does not define the research architecture.

## Core loop

1. compile reviewed text and explicit Bopomofo readings;
2. index exact binding and transition occurrences and possible confusion contrasts;
3. select a relation objective using a declared curriculum policy;
4. retrieve supporting occurrences;
5. compose a variable-length practice sequence under evidence and lexical budgets;
6. let a synthetic learner emit ordinary input traces;
7. aggregate estimates through the same measurement path used by real input;
8. compare estimates and curriculum behavior against hidden learner truth.

Objective selection and text composition remain separate policies so they can be evaluated independently.

## Practice modes

### Guided mode

Chinese context and the complete Bopomofo reading are visible. Binding errors represent symbol-to-key mapping. Clean within-syllable inter-key latency represents directional transition evidence.

### Recall mode

Bopomofo is hidden or progressively revealed. Pronunciation retrieval is added to the task and must remain statistically separate. Recall remains deferred.

## First relational scope

- Traditional Chinese words and short phrases with explicit Bopomofo and all five tones;
- Taiwan Standard Bopomofo layout;
- binding, transition, and confusion identities scoped by mode and layout;
- exact within-syllable adjacency only for transition evidence;
- catalog provenance, frequency, lexical tags, and held-out partitions;
- deterministic synthetic learners and seeded cohort experiments;
- no fixed exercise word count.

## Existing baseline

The completed Phase 4 curriculum focuses one token and selects six entries. It remains useful as a binding-only, fixed-count baseline.

Its destination-token timing score is not treated as an identifiable intrinsic token speed. The same clean interval is more naturally evidence for the incoming transition edge.

## Non-goals before relational simulation is coherent

- additional browser UI refinement;
- immediate human pilot or device-specific optimization;
- accounts, cloud sync, telemetry, or backend services;
- candidate selection or IME prediction quality;
- mobile soft keyboards;
- generated pseudo-words, unless introduced as a separately labeled experiment;
- claiming that simulation proves human learning effectiveness.

## Validation layers

### Catalog structure

- every syllable ends with an explicit tone;
- ordered relation occurrences are reproducible;
- unsupported and concentrated relations are visible;
- held-out partitioning does not silently remove all training support.

### Estimation behavior

- traces recover binding correctness, confusion direction, and transition latency with measurable error against latent truth;
- boundary, noise, and recovery effects remain separate;
- identical inputs and seeds produce identical reports.

### Curriculum behavior

- injected weaknesses are identified with explainable delay;
- target exposure increases without pathological repetition or lexical concentration;
- different objective and composition policies can be compared independently;
- unsupported objectives produce explicit fallback rather than fabricated evidence.

### Human usefulness

Human testing resumes after the relational architecture is stable. It will validate whether the simulated assumptions and resulting text sequences correspond to real learning and interaction, not define the architecture in advance.
