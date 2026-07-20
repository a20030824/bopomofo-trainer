# Transition-driven Bopomofo typing trainer

Status: design record for Issue #46. This document defines the product boundary; it does not implement the generator.

## Product statement

The product is a fully front-end Chinese typing trainer in which:

1. **Bopomofo input transitions decide what to practise.**
2. **Common words decide what linguistic material to practise with.**
3. **Reviewed lexical recomposition decides how the material becomes meaningful natural text.**
4. **A sentence is a rendered exercise container, not the canonical training or content unit.**

The system must not degrade into either of these products:

- a generic passage-copying typing test that happens to accept Chinese input;
- a random stream of frequent characters or isolated words with no natural use.

## Canonical layers

### Transition target

A transition target is an input action or an ordered relation between input actions under a versioned input-method profile.

Examples include:

- Bopomofo symbol to Bopomofo symbol;
- symbol to tone action;
- tone or commit action to the first symbol of the next character;
- the last input action of one lexical item to the first input action of the next item;
- physical-key movement classes such as same-keyboard-row, row change, hand change, repeated finger, or long key distance.

A transition target answers: **what motor or sequencing relation is this exercise intended to train?**

### Lexical item

A lexical item is the canonical content unit. It retains:

- written form;
- reviewed pronunciation identity;
- commonness evidence;
- grammatical category;
- semantic tags;
- permitted frames and collocations;
- ambiguity and review status;
- a derived typing profile for each supported input-method profile.

A lexical item answers: **what real, useful language can carry the target transition?**

### Sentence plan

A sentence plan combines selected lexical items through a reviewed frame and lexical constraints. It is not yet presentation-specific.

A sentence plan answers: **how can the selected words be placed in a natural, controlled context?**

### Rendered exercise

A rendered exercise is the final text shown to the learner together with its trace, metrics, and local session metadata.

A rendered exercise answers: **what does the learner type now, and why was this item selected?**

## Input-method profiles

The design must not hard-code one assumed Bopomofo IME behaviour.

Different platforms and IMEs can differ in:

- whether first tone has an explicit key action;
- how a syllable is committed;
- whether space, selection, or punctuation causes candidate commitment;
- keyboard layout;
- candidate-selection behaviour;
- whether observable browser events expose intermediate composition details.

A versioned input-method profile therefore defines:

- symbol-to-key mapping;
- tone and commit actions;
- keyboard coordinates and finger/hand annotations when known;
- the canonical action sequence derived from a reviewed pronunciation;
- which action classes are observable in the browser and which remain inferred.

The trainer may analyse expected action sequences, but it must not claim to observe keystrokes that browser IME events do not reliably expose.

## Transition taxonomy

Transitions are separated because they have different training meanings.

### Within-syllable transitions

Relations among initial, medial, final, and tone or commit actions within one syllable.

These are the strongest early training targets because pronunciation identity and action boundaries are comparatively stable.

### Cross-character transitions

The final action of one character's pronunciation to the first action of the next character inside one lexical item.

These capture real multi-character word flow without depending on sentence recomposition.

### Cross-word transitions

The boundary between two lexical items in a rendered sentence.

These are useful later, but they must not cause unnatural word selection or sentence construction. Naturalness outranks a desired cross-word transition.

### Physical-position features

Derived properties of a transition under a keyboard profile:

- Euclidean or grid key distance;
- same hand or hand alternation;
- same finger or finger alternation;
- same row or row change;
- movement direction;
- repeated key;
- tone/commit involvement.

These features describe difficulty; they do not replace corpus frequency or learner evidence.

## Early-stage priority

Commonness is the dominant content prior in the early phase.

This means the trainer should first build fluency from transitions that occur in highly common, useful words. It should not seek uniform keyboard coverage by introducing rare words prematurely.

A useful distinction is:

- **transition prevalence**: how much a transition is represented after weighting lexical items by commonness;
- **transition difficulty**: how demanding its physical or sequencing features are;
- **learner need**: local evidence such as delay, correction, and repeated failure;
- **content suitability**: whether a common, unambiguous, naturally composable lexical item can carry it.

Before enough learner history exists, prevalence and content suitability dominate. As local evidence grows, learner need can receive more weight.

## Why sentences are still generated

Typing only isolated words loses realistic continuity, punctuation, rhythm, and cross-item flow. The trainer therefore renders sentences, but it must construct them from selected lexical items rather than select arbitrary sentences first.

Required direction:

```text
transition target
→ eligible common lexical items
→ anchor lexical items
→ reviewed frame and collocations
→ sentence plan
→ deterministic validation
→ rendered exercise
```

Rejected direction:

```text
random or pre-existing sentence
→ post-hoc explanation of whatever transitions happen to occur
```

The first direction makes training intent explicit while preserving meaningful language.

## Naturalness boundary

A sentence is eligible only when all of the following are true:

- every lexical item has an accepted pronunciation identity for the intended use;
- the frame accepts the selected grammatical categories;
- lexical selection restrictions are satisfied;
- reviewed collocation rules permit the combination;
- no unresolved heteronym or segmentation ambiguity changes the expected input sequence;
- the sentence remains within the current length and non-target difficulty budget;
- the target lexical item is used with the intended meaning;
- the result is natural enough to be included in a static reviewed asset.

Part-of-speech matching alone is insufficient. For example, a verb and noun can be grammatically shaped yet semantically incompatible.

## Role of generative models

A language model may assist an offline authoring workflow by proposing candidate frames, collocations, or sentences. It must not directly publish runtime exercises.

Every shipped sentence plan must be represented by versioned static data and pass deterministic validation. The fully front-end runtime must remain functional without a model, network request, account, or server.

## Front-end-only boundary

The intended runtime uses:

- versioned static lexical and frame assets;
- deterministic client-side selection;
- browser IME composition events for input handling;
- local storage or IndexedDB for progress and recent-history state;
- optional PWA caching for offline use.

It does not require:

- accounts;
- a backend API;
- cloud synchronization;
- server-side generation;
- remote learner analytics;
- runtime access to source spreadsheets or research corpora.

Raw research sources are transformed into reviewed distributable assets before runtime.

## Explainability requirement

Every rendered exercise must be able to expose an internal trace containing at least:

- selected target transition IDs;
- selected anchor lexical item IDs;
- commonness evidence version;
- input-method profile version;
- sentence frame ID;
- lexical constraint checks;
- target and incidental transition counts;
- difficulty budget result;
- selection score components;
- deterministic tie-break key;
- any reasons a higher-ranked candidate was rejected.

The UI does not need to display the complete trace, but tests and debugging tools must be able to inspect it.

## Product success criteria

The design succeeds when the learner experiences natural Chinese typing while the system can still answer precisely:

- which Bopomofo transition was being trained;
- why these common words were selected;
- why the words can be combined naturally;
- how much target exposure the sentence provides;
- why the sentence was preferred over alternatives;
- which evidence comes from static language data and which comes from local learner history.

## Non-goals for the first implementation

- Uniform coverage of every possible Bopomofo transition.
- Free-form runtime sentence generation.
- Exact observation of hidden IME keystrokes.
- Phonetics quizzes or multiple-choice pronunciation tests.
- A general Chinese curriculum or semantic language-learning system.
- Ranking words only by raw frequency without pronunciation and composability checks.
- Treating a corpus sentence as the permanent canonical exercise object.
