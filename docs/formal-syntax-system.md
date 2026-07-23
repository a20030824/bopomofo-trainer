# Mandarin formal syntax system

## Status

This document defines `mandarin-formal-grammar-v1`, the formal syntax contract for practice utterance generation.

The system replaces the assumption that one catalog entry has one product grammar role and that a fixed list of complete templates defines the candidate universe. There is no built-in fixed-template list. The legacy compatibility composer can operate only when a caller supplies templates explicitly; new syntax work must follow this contract.

## Product boundary

The syntax system is intentionally non-semantic.

It may consume only:

- exact catalog identity `(text, reading)`;
- UD UPOS labels;
- dependency relations and dependency direction;
- observed surface position;
- morphosyntactic features;
- explicit valency evidence;
- declared syntactic functions;
- formal construction compatibility;
- frequency and learner records after grammatical derivation is complete.

It must not store, consume, infer, rank, repair, or validate with:

- definitions, glosses, senses, or meanings;
- semantic roles or selectional restrictions;
- animacy, plausibility, sentiment, topic, intent, or world knowledge;
- collocation meaning, embeddings, language models, knowledge graphs, or semantic proxies.

Semantic oddity is not a syntax error. When syntax-only evidence cannot resolve a case, the system retains every otherwise valid formal profile or fails closed. It never chooses by meaning.

The following field names are forbidden in formal syntax schemas and serialized artifacts:

```text
meaning
definition
sense
semanticRole
animacy
plausibility
embedding
topic
intent
worldKnowledge
```

Validation must fail when a forbidden field appears anywhere in a syntax rule, profile, derivation, or report.

## Identity and profile model

Catalog identity remains the exact pair:

```text
(text, reading)
```

Distinct readings of the same written text are independent catalog entries and must not deduplicate each other.

Each catalog entry may have zero or more `SyntaxProfile` records:

```text
CatalogEntry 1 ── N SyntaxProfile
```

A profile is identified by:

```text
(entryId, UPOS, syntactic features, valency frames, dependency evidence)
```

Rules:

1. The same `(text, reading)` may have multiple UPOS profiles.
2. Every significant observed UPOS remains representable; no dominant-UPOS reduction is allowed in the formal profile layer.
3. When UD evidence is written-form-only and does not distinguish pronunciation, every active reading of that text receives the same projected syntax profiles.
4. The system must not infer which pronunciation belongs to which profile by meaning.
5. Profiles deduplicate only when all syntax-bearing fields are equal.
6. Existing product roles such as `subject`, `object`, and `transitive-predicate` are syntactic functions, not parts of speech.
7. A catalog entry with no UD evidence is recorded explicitly as `no-ud-evidence`; it is never assigned a guessed UPOS.

## Complete UPOS vocabulary

The formal model supports all 17 Universal Dependencies UPOS values:

```text
ADJ
ADP
ADV
AUX
CCONJ
DET
INTJ
NOUN
NUM
PART
PRON
PROPN
PUNCT
SCONJ
SYM
VERB
X
```

No UPOS may be removed because it is rare or absent from the current active catalog.

`PUNCT` is a formal surface node and need not be a Bopomofo practice entry. `SYM` and `X` remain valid schema values even when the active catalog currently provides no lexical realization.

## Formal categories

The minimum category vocabulary for v1 is:

```text
Document
Sentence
Clause
ClauseSequence
Coordination
Topic
Subject
Predicate
Object
IndirectObject
Complement
Adjunct
Nominal
NominalHead
NounPhrase
PronounPhrase
ProperNounPhrase
VerbPhrase
AdjectivePhrase
AdverbPhrase
AdpositionPhrase
NumeralPhrase
DeterminerPhrase
ParticlePhrase
ComplementizerPhrase
RelativeClause
ContentClause
QuotedClause
Punctuation
Lexeme
```

Categories describe formal structure. They do not describe meaning.

## Feature vocabulary

Rules may constrain declared syntax features, including:

```text
upos
function
valency
polarity
aspect
modality
voice
questionType
clauseType
complementType
coordinationType
surfacePosition
dependencyRelation
dependencyDirection
recursionDepth
```

Feature values must be finite, versioned string unions. Free-form semantic labels are forbidden.

## Valency vocabulary

The v1 valency vocabulary is:

```text
avalent
intransitive
transitive
ditransitive
ambitransitive
copular
clausal-complement
open-clausal-complement
adpositional-complement
serial-verb
causative
resultative
```

A profile may declare multiple valency frames when the syntax evidence supports multiple structures. Valency is never selected by lexical meaning.

## Production rule contract

Every `ProductionRule` must declare:

- a globally unique stable ID;
- grammar version;
- input category sequence;
- output category;
- required constituents;
- optional constituents;
- repeatable constituents with explicit bounds;
- surface order alternatives;
- feature constraints;
- valency constraints;
- recursive positions;
- prohibited combinations;
- at least one positive fixture;
- at least one negative fixture.

A rule is invalid when it:

- contains an unbounded repetition;
- introduces a category not declared by the grammar version;
- references an unknown UPOS, feature, function, or valency frame;
- contains a forbidden semantic field;
- recursively expands without consuming depth budget;
- produces no realizable derivation under its positive fixture.

## Versioned derivation bounds

“All derived forms” means every structure reachable from the declared production rules within the versioned finite bounds.

`mandarin-formal-grammar-v1` uses:

```text
maximum phrase depth: 4
maximum clause nesting: 3
maximum clauses per sentence: 4
maximum coordination items: 3
maximum consecutive modifiers: 3
maximum complements per predicate: 2
maximum lexical catalog entries per utterance: 12
```

These are termination bounds only. They must not remove a construction kind from the grammar.

Changing a bound changes the grammar configuration digest and coverage report, but not the stable identity of individual production rules.

## Phrase productions

The grammar must represent at least the following phrase families.

### Nominal phrases

```text
NounPhrase -> NominalHead
NounPhrase -> DeterminerPhrase? NumeralPhrase? Modifier{0..3} NominalHead
NounPhrase -> Possessor Particle(de) NominalHead
NounPhrase -> RelativeClause Particle(de) NominalHead
NounPhrase -> Coordination<NounPhrase>
```

Nominal heads may be realized by `NOUN`, `PRON`, or `PROPN` profiles according to the rule’s declared constraints.

### Verb phrases

```text
VerbPhrase -> VerbHead
VerbPhrase -> Negation? Modal{0..2} Adverbial{0..3} VerbHead Complement{0..2} Object{0..2} AspectParticle?
VerbPhrase -> SerialVerbSequence
VerbPhrase -> Coordination<VerbPhrase>
```

Object cardinality and complement shape are constrained by the selected valency profile, never by lexical meaning.

### Adjective phrases

```text
AdjectivePhrase -> AdjectiveHead
AdjectivePhrase -> DegreeAdverb? Negation? AdjectiveHead Complement?
AdjectivePhrase -> Coordination<AdjectivePhrase>
```

### Adverb phrases

```text
AdverbPhrase -> AdverbHead
AdverbPhrase -> DegreeAdverb? AdverbHead
AdverbPhrase -> Coordination<AdverbPhrase>
```

### Adposition phrases

```text
AdpositionPhrase -> AdpositionHead NounPhrase
AdpositionPhrase -> NounPhrase LocalizerParticle
AdpositionPhrase -> Coordination<AdpositionPhrase>
```

### Numeral phrases

```text
NumeralPhrase -> NumeralHead
NumeralPhrase -> NumeralHead ClassifierParticle
NumeralPhrase -> NumeralHead ClassifierParticle NounPhrase
```

### Particle phrases

Particle nodes represent structural, aspectual, and sentence-final particles using syntax-only feature declarations.

### Coordination

```text
Coordination<X> -> X CCONJ X
Coordination<X> -> X PUNCT X CCONJ X
```

Coordination is permitted for every category explicitly enabled by a production rule. The item bound is 2–3 in v1.

## Clause productions

The grammar must include formal productions for:

1. nominal-predicate clauses;
2. adjective-predicate clauses;
3. intransitive clauses;
4. transitive clauses;
5. ditransitive clauses;
6. copular clauses;
7. existential and presentational structures;
8. locative clauses;
9. modal clauses;
10. negative clauses;
11. aspect-marked clauses;
12. `把` constructions;
13. `被` constructions;
14. causative constructions;
15. pivotal constructions;
16. serial-verb constructions;
17. comparative constructions;
18. topic-comment clauses;
19. formally licensed subject omission;
20. formally licensed object omission;
21. imperative, request, and exclamative forms;
22. polar questions;
23. A-not-A questions;
24. alternative questions;
25. constituent questions.

Construction names are formal rule identifiers. They do not imply a semantic interpretation.

## Complements and embedded clauses

The grammar must represent:

- result complements;
- directional complements;
- potential complements;
- degree complements;
- quantity complements;
- duration complements;
- subject clauses;
- object clauses;
- complement clauses;
- relative clauses;
- `的` nominalization;
- quoted and content-clause surface structures.

Complement compatibility may use only declared dependency, order, feature, and valency evidence.

## Complex clauses and recursion

The grammar must provide productions for:

- coordination;
- additive progression;
- alternatives;
- cause-result marking;
- conditions;
- hypotheticals;
- concessives;
- contrast;
- purpose marking;
- temporal sequence;
- nested modification;
- embedded clauses;
- phrase and clause coordination.

Connective labels are formal construction IDs backed by UPOS, dependency relations, and surface order. No rule may infer a discourse relation from sentence meaning.

## Derivation modes

### Exhaustive structural mode

Used by tests and coverage tooling.

It enumerates every distinct derivation shape reachable within the declared bounds while treating lexical leaves as typed placeholders. Structural identity includes:

- production rule IDs;
- category tree;
- feature assignments;
- ordered child positions;
- recursion depth.

It does not expand the full lexical Cartesian product.

### Lazy lexical mode

Used by the product.

It selects a legal derivation shape, then resolves lexical leaves from indexed compatible profiles. Every compatible entry must remain reachable under deterministic seeded sampling.

The implementation may backtrack when a later leaf has no legal realization, but every loop and retry count must be explicitly bounded.

### Reachability requirements

The system must demonstrate separately that:

1. every structural shape within the bounds is enumerable;
2. every compatible profile is indexable;
3. every compatible catalog entry can be selected for each legal leaf position;
4. no complete sentence Cartesian product is materialized in memory.

## Surface realization

Realization preserves the exact ordered catalog entries selected by the derivation and inserts only declared non-lexical formal nodes such as punctuation.

A `SurfaceRealization` contains:

- grammar version;
- derivation ID;
- production rule path;
- ordered lexical entry IDs;
- ordered syntax profile IDs;
- surface tokens;
- punctuation nodes;
- deterministic identity digest.

It contains no semantic score.

## Curriculum integration

The product order is:

```text
frequency stage determines eligible catalog entries
→ load every syntax profile for those entries
→ derive grammar-valid structures
→ validate the derivation
→ apply frequency and learner-record weighting
→ realize one practice utterance
```

Permitted post-derivation weighting remains:

- commonness or frequency band;
- recent entry, derivation, and utterance penalties;
- expected-token error evidence;
- accepted binding timing;
- exact within-syllable transition timing.

Forbidden weighting includes sentence meaning, naturalness, collocation quality, semantic plausibility, embeddings, or LLM reranking.

The former 11-template default was removed. Large lexical generations now project every observed UPOS profile and compute rule reachability without enumerating the sentence Cartesian product. Product/browser cutover is a separate consumer concern and must not reintroduce built-in templates.

## Validation and coverage

Required tests and machine-readable coverage include:

- all 17 UPOS values;
- one entry with multiple UPOS profiles;
- all readings of one written text sharing syntax-only profiles;
- a positive and negative fixture for every production rule;
- every optional constituent both present and absent;
- every declared surface order;
- each recursive position;
- maximum-depth termination;
- cycle detection;
- deterministic replay;
- exact identity deduplication;
- lazy lexical reachability;
- forbidden-field rejection;
- no embedding, language-model, or network dependency;
- catalog/profile synchronization;
- browser progress migration and held-out isolation.

The coverage artifact reports:

```text
UPOS coverage
dependency relation coverage
production rule coverage
construction coverage
catalog-entry syntax coverage
reading-variant coverage
unrealizable profile count
derivation-shape count by bound
no-ud-evidence entry count
```

Acceptance requires `unrealizable profile count = 0` for profiles admitted to the product derivation index. Entries without UD evidence remain explicitly reported and are not silently annotated.

## Evidence artifact requirements

UD syntax evidence v2 must be anonymous and syntax-only. For each written-form identity it may preserve:

- UPOS counts;
- dependency relation counts;
- parent UPOS counts;
- head/dependent left-right direction counts;
- root occurrences;
- child relation multisets;
- `obj`, `iobj`, `ccomp`, `xcomp`, `obl`, and related valency counts;
- `cop`, `aux`, `mark`, `case`, `cc`, and `conj` structure counts;
- surface-position counts;
- anonymous dependency skeletons consisting only of UPOS, dependency relation, direction, and nesting.

It must not preserve source sentences, candidate-context text, definitions, glosses, semantic labels, or non-candidate lexical strings.

Every artifact declares:

- schema version;
- source release;
- source file checksums;
- candidate source checksum;
- deterministic content digest;
- redistribution boundary.

## Migration sequence

The implementation sequence is:

1. preserve the current reviewed catalog and heteronym identity baseline;
2. freeze this specification;
3. project UD syntax evidence v2;
4. add multi-profile syntax schema;
5. add formal grammar IR and validator;
6. add phrase productions;
7. add clause and question productions;
8. add complements and special constructions;
9. add recursive complex clauses;
10. integrate lazy derivation with the frequency-first curriculum;
11. emit manifest-linked lexical profile and rule-reachability artifacts;
12. gate the browser catalog with a compact allowlist derived from the full rule-reachability index;
13. reject stale or incomplete allowlists during product compilation;
14. emit the complete syntax coverage report.

Every commit must leave catalog build and the ordinary product checks runnable. No commit may temporarily route product selection around grammar validation.
