# NAER first activation-review batch

This projection creates the first compact grammar-review queue from the committed
NAER top-1,000 evidence. It is a **review artifact**, not a runtime catalog
expansion and not an automatic grammar annotation.

## Why this stage exists

The top-1,000 reading projection resolves 911 candidate identities, while the UD
Chinese GSD projection provides syntax evidence for 942 candidates. Those two
facts alone do not make every candidate safe to activate:

- 89 candidates still require an explicit reading choice;
- 403 candidates have unseen or materially mixed UD evidence;
- many high-frequency items are particles, conjunctions, determiners,
  classifiers, adpositions, or adverbs that have no slot in the current
  sentence templates;
- the current 49-entry source catalog must not be duplicated.

This stage intersects the evidence and emits a small, commonness-first set for
human review.

## Deterministic selection

Candidates are evaluated in ascending `naer_general_rank`. Exclusion uses this
fixed precedence so every candidate contributes to exactly one count:

1. `active-catalog`
2. `reading-review-required`
3. `ud-syntax-review-required`
4. `insufficient-ud-occurrences`
5. `unstable-dominant-upos`
6. `unsupported-template-evidence`

A candidate is eligible only when it:

- is absent from `data/source/words.sample.csv`;
- is automatically resolved by MOE Concised, MOE Revised fallback, or unique
  CC-CEDICT evidence;
- is absent from the committed UD syntax-review queue;
- has at least five exact-FORM UD occurrences;
- has one significant UPOS category and the same single dominant UPOS category;
- belongs to one of the template-relevant evidence lanes below.

The first 100 eligible rows are selected. There is no balancing quota, random
sampling, semantic score, transition score, or learner-specific weighting.
Commonness rank remains the sole ordering rule.

## Review lanes are not product roles

The generated CSV groups evidence for review:

| UD evidence | Review lane |
|---|---|
| `NOUN`, `PROPN`, `PRON` | `nominal-evidence` |
| `VERB` | `verbal-evidence` |
| `ADJ` | `adjectival-evidence` |
| `AUX` | `auxiliary-evidence` |

These lanes do **not** imply:

- `subject`, `object`, or `temporal` product roles;
- transitive, intransitive, ambitransitive, modal, or adjectival predicate
  frames;
- a template assignment;
- activation approval.

For example, nominal evidence still requires a reviewer to decide whether an
identity can be a subject, object, temporal expression, both, or neither.
Observed object dependents for verbs remain corpus evidence and cannot be
promoted directly to lexical valency.

## Outputs

```text
data/grammar/naer-top-1000-activation-review-batch-1.csv
data/grammar/naer-top-1000-activation-review-batch-1-report.json
```

The CSV contains rank, reading authority and evidence, review lane, compact UPOS
and dependency counts, root count, and observed verb-object pattern. Its
`review_status` is always `pending`; generated output is not hand-edited.

The JSON report locks all input digests, selection policy, exclusion counts,
eligible count, selected rank range, lane distribution, reading-authority
distribution, selected identities, CSV checksum, and determinism digest.

## Reproduction

```bash
npm run lexicon:activation-review-batch
```

All inputs are committed candidate-scoped artifacts. This command does not need
the full NAER workbook, MOE dictionaries, CC-CEDICT archive, or UD CoNLL-U
files.

## Next boundary

A later reviewed stage may copy approved rows into a hand-authored grammar
sidecar with explicit product roles and predicate frames. Only after grammar
validation and sentence-composition tests pass may another PR consider runtime
catalog expansion.

This projection itself does not change:

- the 49-entry runtime catalog;
- grammar annotations or templates;
- stage eligibility;
- commonness calculation;
- exercise selection;
- learner adaptation;
- confusion diagnostics;
- transition scoring.
