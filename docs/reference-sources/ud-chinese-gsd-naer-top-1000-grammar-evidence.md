# UD Chinese GSD syntax evidence for the NAER top 1,000

This projection adds a corpus-evidence layer between ranked lexical candidates and formal syntax profiles. It does not assign product meaning, semantic roles, or plausibility.

## Source lock

The adapter uses Universal Dependencies Chinese GSD release `r2.18`, a Traditional Chinese treebank whose UD annotations are licensed CC BY-SA 4.0. The three complete CoNLL-U files remain local under:

```text
data/external/ud/chinese-gsd/r2.18/
```

Pinned files:

| Split | Bytes | SHA-256 |
|---|---:|---|
| train | 9,318,330 | `de36e605a4786edb00097165cfc0ee425ab668a2dfc1da7ce4652ba4d2585b1e` |
| dev | 1,195,021 | `09374c8361400861a536ae94a1d7710e1cdd72285c32b9764d94d2d956b4ae02` |
| test | 1,136,344 | `ff01a3d01d62b623756396085e78bdaeefb7c2b7935a890dde5b18e92712d54f` |

The committed outputs contain no source sentence, comment, `sent_id`, context, or non-candidate lexical string. They retain only aggregate syntax evidence attached to one of the committed NAER top-1,000 written-form identities.

## Matching boundary

Candidates are matched by exact CoNLL-U `FORM` equality after the existing NAER candidate file has passed its checksum and continuous-rank checks.

UD does not distinguish which pronunciation was used in a sentence. Downstream profile projection therefore shares every written-form syntax profile with every active `(text, reading)` identity for that text. It must not select a pronunciation by meaning.

## Evidence schema v2

`ud-syntax-evidence-v2` preserves all v1 fields used by existing activation tooling and adds the structure required by `mandarin-formal-grammar-v1`.

For each observed candidate it aggregates:

- occurrence counts by train/dev/test split;
- all 17 UPOS values and XPOS counts;
- dependency-relation and morphological-feature counts;
- parent UPOS counts;
- head-left, head-right, and root direction counts;
- initial, medial, final, and singleton surface positions;
- child dependency-relation counts;
- child direction plus relation counts;
- child-relation multiset distributions;
- valency-relation counts and per-occurrence valency signatures;
- `cop`, `aux`, `mark`, `case`, `cc`, and `conj` self/child structure counts;
- root usage;
- lemma agreement, mismatch, and missing counts without emitting lemma text;
- for `VERB` observations, subject and direct/indirect-object dependent counts;
- anonymous dependency skeletons containing only UPOS, dependency relation, direction, and at most three descendant levels;
- one `syntaxProfileEvidence` partition for every observed UPOS.

The adapter rejects any UPOS outside the complete UD vocabulary:

```text
ADJ ADP ADV AUX CCONJ DET INTJ NOUN NUM PART PRON PROPN PUNCT SCONJ SYM VERB X
```

Multiword-token ranges and empty nodes are not treated as lexical observations. The parser keeps explicit counters and deterministic handling for future source updates.

## Anonymity boundary

Anonymous skeletons deliberately omit:

- `FORM` for candidate and context tokens;
- lemma strings;
- sentence IDs and source comments;
- definitions, glosses, senses, or semantic labels;
- any non-candidate lexical string.

A skeleton node has only:

```text
UPOS
dependency relation
left/right/root direction
anonymous child nodes
```

The complete source sentence cannot be reconstructed from the artifact.

## Current committed v2 result

The committed top-1,000 artifacts were replayed from the three pinned r2.18 files and verified before commit:

| Measure | Count |
|---|---:|
| Ranked candidates | 1,000 |
| Candidates observed as exact FORM | 942 |
| Candidates unseen | 58 |
| Matching token occurrences | 52,938 |
| Source sentences | 4,997 |
| Source syntactic tokens | 123,289 |
| Candidates queued for syntax review | 403 |

Current v2 determinism digests:

```text
evidence  16c7daaf4c45714c560ad01558ba276ac39d65e4e326382fe841710975448db4
coverage  f61a88fdc5a2db894f467f09f7ca4081bb7d056f5b31b9c1c6f4e17f0f9b48fb
```

The replay also verifies that every observed row has at least one per-UPOS `syntaxProfileEvidence` partition. The compact evidence JSON is 18,699,294 bytes and the compact coverage JSON is 71,209 bytes. Compact formatting changes storage size only; the determinism digests cover the same structured payload.

## Review boundary

A UPOS category is considered significant when it has at least two occurrences and at least 10% of the candidate's observations. Mixed object-frame evidence uses the same minimum count and share over `VERB` occurrences. These thresholds identify evidence requiring multiple formal profiles; they must not collapse the evidence to a dominant category.

The legacy product grammar had no dedicated template slot for:

```text
ADP CCONJ DET NUM PART SCONJ
```

That remains useful as a compatibility audit. The formal syntax schema itself supports all 17 UPOS values, so its unsupported-UPOS list is empty.

## Verb evidence boundary

For candidate occurrences tagged `VERB`, the adapter records whether the token has observed `nsubj`/`csubj` and `obj`/`iobj` dependents. It classifies only the observed corpus pattern:

```text
not-observed-as-verb
object-bearing-only
objectless-only
mixed-object-evidence
```

This must not be promoted directly to one product frame. Missing objects can reflect ellipsis, coordination, annotation choices, or surface structure. V2 therefore also retains the complete declared valency-relation signature distribution so downstream profiles can preserve multiple formal frames.

## Outputs

```text
data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-evidence.json
data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-coverage.json
```

The evidence artifact contains one sparse row per ranked candidate. The coverage artifact contains aggregate counts, rank buckets, complete UPOS coverage, dependency and valency relation totals, review policy, review queue, and legacy/formal schema audits.

Generated JSON is deterministic compact UTF-8 with LF line endings on every platform. Candidate input checksumming normalizes line endings before hashing.

## Reproduction

Place the pinned CoNLL-U files in the local ignored directory, then run:

```bash
npm run grammar:ud-evidence
```

The command does not download data.

## Non-goals

This projection does not:

- change the runtime catalog directly;
- resolve reading-review candidates;
- infer meanings, senses, semantic roles, animacy, or plausibility;
- use dictionary definitions or CC-CEDICT English glosses;
- choose a single UPOS or valency frame when several are observed;
- change commonness, stage eligibility, learner adaptation, confusion diagnostics, or transition scoring.
