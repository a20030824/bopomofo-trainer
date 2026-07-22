# First NAER activation grammar review: batch orders 1–25

This review converts the first 25 rows of the committed activation-review batch
into explicit product decisions. It remains a **review sidecar** and does not
change the active catalog.

## Locked input

The source batch is:

```text
data/grammar/naer-top-1000-activation-review-batch-1.csv
```

The source screening report must retain this determinism digest:

```text
bfd7022c957ac03e4263843753b2979b5e6d8c09ff54e1c55302b59404c19d4b
```

The review covers exactly batch orders 1–25. It does not skip difficult rows or
replace commonness order with a hand-selected vocabulary list.

## Decisions

| Order | Text | Decision | Reviewed annotation or hold boundary |
|---:|---|---|---|
| 1 | 我 | approved | `subject;object`, frame `none` |
| 2 | 他 | approved | `subject;object`, frame `none` |
| 3 | 你 | approved | `subject;object`, frame `none` |
| 4 | 她 | approved | `subject;object`, frame `none` |
| 5 | 它 | approved | `subject;object`, frame `none` |
| 6 | 讓 | held | causative requires object plus predicate/complement |
| 7 | 年 | held | bare time unit requires numeral/modifier context |
| 8 | 自己 | approved | `subject;object`, frame `none` |
| 9 | 他們 | approved | `subject;object`, frame `none` |
| 10 | 被 | held | passive construction is absent |
| 11 | 什麼 | held | interrogative templates and punctuation are absent |
| 12 | 時候 | held | bare temporal noun requires modifier/linking context |
| 13 | 等 | held | nominal “etc.” and verbal “wait” remain ambiguous |
| 14 | 次 | held | classifier/count construction is absent |
| 15 | 覺得 | held | clausal/adjectival complement construction is absent |
| 16 | 天 | held | bare day unit requires numeral/modifier context |
| 17 | 月 | held | bare month unit requires numeral/modifier context |
| 18 | 一些 | held | attributive quantity is not an adjectival predicate |
| 19 | 元 | held | currency-unit construction is absent |
| 20 | 地方 | approved | `subject;object`, frame `none` |
| 21 | 孩子 | approved | `subject;object`, frame `none` |
| 22 | 裡面 | held | locative-noun and adpositional uses remain mixed |
| 23 | 一樣 | approved | `adjectival-predicate`, frame `adjectival` |
| 24 | 不會 | approved | `modal`, frame `modal` |
| 25 | 歲 | held | age-unit construction is absent |

Result:

```text
reviewed  25
approved  11
held      14
```

The decision-sidecar digest is:

```text
1e0198d15281bceb0b47a9b45064025bb747153a49acf1bde8ca7115d5d78e53
```

## Why UPOS is not enough

The activation batch only establishes that a candidate has stable corpus
evidence in a broad review lane. Product approval still requires checking that
the lexical item can fill one of the existing complete Mandarin templates.

Examples:

- `被` is consistently auxiliary-like but needs a passive template;
- `一些` is tagged adjectivally in the source treebank but cannot fill the
  current predicative adjective slot;
- `覺得` is verb-like but normally requires a clausal or adjectival complement;
- `次`, `元`, and `歲` require quantified constructions;
- `年`, `天`, `月`, and `時候` are unsafe as bare temporal slots.

A hold is therefore not a claim that the word is rare or ungrammatical. It means
the current product schema cannot use the bare lexical item without risking an
invalid utterance.

## Approved boundary

The eleven approved rows use only existing schema values:

```text
subject;object + frame none
adjectival-predicate + frame adjectival
modal + frame modal
```

All approved rows retain `lexical-prompt` as standalone behavior. This review
does not yet authorize catalog activation. Activation remains a later PR that
must update lexical rows, reading projections, grammar annotations, commonness
coverage, generated outputs, and tests together.

## Validation

Run:

```bash
python scripts/validate_activation_review_decisions.py
```

The validator fails when:

- the source report or first-25 identity order drifts;
- a decision row is missing, duplicated, or reordered;
- reading evidence no longer matches the screened source row;
- an approved row uses an unknown or inconsistent role/frame;
- a held row contains latent roles, frame, or standalone behavior;
- the 11-approved / 14-held partition changes without an explicit digest update.

## Non-goals

This review does not:

- modify `data/source/words.sample.csv` or `data/source/grammar.sample.csv`;
- activate any of the eleven approved identities;
- add passive, causative, interrogative, classifier, quantified-unit, or
  complement templates;
- infer predicate frames from UD object counts;
- change commonness, stage eligibility, exercise selection, learner adaptation,
  diagnostics, or transition scoring.
