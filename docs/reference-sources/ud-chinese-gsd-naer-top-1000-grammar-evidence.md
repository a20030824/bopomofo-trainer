# UD Chinese GSD grammar evidence for the NAER top 1,000

This projection adds a **corpus-evidence layer** between ranked lexical
candidates and reviewed product grammar annotations. It does not assign product
roles automatically.

## Source lock

The adapter uses Universal Dependencies Chinese GSD release `r2.18`, a
Traditional Chinese treebank whose UD annotations are licensed CC BY-SA 4.0.
The three complete CoNLL-U files remain local under:

```text
data/external/ud/chinese-gsd/r2.18/
```

Pinned files:

| Split | Bytes | SHA-256 |
|---|---:|---|
| train | 9,318,330 | `de36e605a4786edb00097165cfc0ee425ab668a2dfc1da7ce4652ba4d2585b1e` |
| dev | 1,195,021 | `09374c8361400861a536ae94a1d7710e1cdd72285c32b9764d94d2d956b4ae02` |
| test | 1,136,344 | `ff01a3d01d62b623756396085e78bdaeefb7c2b7935a890dde5b18e92712d54f` |

The committed outputs contain no source sentence, comment, `sent_id`, context,
or non-candidate lemma string. They retain only aggregate evidence attached to
one of the committed NAER top-1,000 identities.

## Matching boundary

Candidates are matched by exact CoNLL-U `FORM` equality after the existing NAER
candidate file has passed its own checksum and continuous-rank checks.

The adapter aggregates:

- occurrence counts by train/dev/test split;
- UPOS and XPOS counts;
- dependency-relation and morphological-feature counts;
- root usage;
- lemma agreement, mismatch, and missing counts without emitting lemma text;
- for `VERB` observations, subject and direct/indirect-object dependent counts.

Multiword-token ranges and empty nodes are not treated as lexical observations.
The current `r2.18` files contain no such lines, but the parser keeps explicit
counters and deterministic handling for future source updates.

## Current result

| Measure | Count |
|---|---:|
| Ranked candidates | 1,000 |
| Candidates observed as exact FORM | 942 |
| Candidates unseen | 58 |
| Matching token occurrences | 52,938 |
| Source sentences | 4,997 |
| Source syntactic tokens | 123,289 |
| Candidates queued for syntax review | 403 |

Rank-bucket coverage:

| Rank range | Observed | Unseen | Matching occurrences |
|---|---:|---:|---:|
| 1–100 | 100 | 0 | 28,308 |
| 101–250 | 142 | 8 | 9,241 |
| 251–500 | 239 | 11 | 7,067 |
| 501–1,000 | 461 | 39 | 8,322 |

Review reasons are intentionally conservative and may overlap:

| Reason | Candidates |
|---|---:|
| significant mixed UPOS evidence | 260 |
| significant mixed object-frame evidence | 149 |
| unseen in the treebank | 58 |

A UPOS category is considered significant when it has at least two occurrences
and at least 10% of the candidate's observations. Mixed object-frame evidence
uses the same minimum count and share over `VERB` occurrences. These thresholds
filter one-off annotation noise while preserving genuinely mixed usage for
human review.

## Grammar-schema gap

The current product grammar vocabulary models subject, object, temporal,
predicate, modal, adverbial, adjectival, and formulaic slots. It has no dedicated
slot for these observed UD categories:

```text
ADP CCONJ DET NUM PART SCONJ
```

Candidates whose dominant evidence includes those categories:

| UPOS | Candidate count |
|---|---:|
| ADP | 54 |
| CCONJ | 8 |
| DET | 20 |
| NUM | 23 |
| PART | 59 |
| SCONJ | 29 |

This is a schema audit, not a mapping rule. For example, corpus evidence that a
word is often `PART` or `SCONJ` does not authorize the adapter to invent a
product slot, template, or grammatical role.

## Verb evidence boundary

For candidate occurrences tagged `VERB`, the adapter records whether the token
has observed `nsubj`/`csubj` and `obj`/`iobj` dependents. It classifies only the
observed corpus pattern:

```text
not-observed-as-verb
object-bearing-only
objectless-only
mixed-object-evidence
```

This must not be promoted directly to the product's `transitive`,
`intransitive`, or `ambitransitive` predicate frames. Missing objects in a
sentence can reflect ellipsis, coordination, annotation choices, or discourse
context rather than lexical valency.

## Outputs

```text
data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-evidence.json
data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-coverage.json
```

The evidence artifact contains one sparse row per ranked candidate. The coverage
artifact contains aggregate counts, rank buckets, review policy, review queue,
and the grammar-schema gap audit.

Current determinism digests:

```text
evidence  4e8449e14ef62ef683a8edc3da8085c47a391a29540c72e30419e51f8ad76459
coverage  53f2259bf725732f652c237955350a1365029ef0a6ec48321fee2bc5bcb8e391
```

Generated JSON is written with LF line endings on every platform. Candidate
input checksumming normalizes line endings before hashing, preventing Windows
CRLF and Git/Linux LF normalization from creating false source drift.

## Reproduction

Place the pinned CoNLL-U files in the local ignored directory, then run:

```bash
npm run grammar:ud-evidence
```

The command does not download data and is safe for offline repetition.

## Non-goals

This projection does not:

- change the runtime catalog directly (activation batches do that separately,
  consuming this evidence);
- resolve reading-review candidates itself (that count changes with every
  batch; CC-CEDICT identity hints and heteronym activation own that step);
- assign product grammar roles or predicate frames;
- create new templates for particles, conjunctions, determiners, classifiers,
  or other function words;
- infer syntax from dictionary definitions or CC-CEDICT English glosses;
- change commonness, stage eligibility, exercise selection, learner adaptation,
  confusion diagnostics, or transition scoring.
