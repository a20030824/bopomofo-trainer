# NAER activation grammar review: batch orders 26–50

This review converts batch orders 26–50 from the committed activation-review batch into explicit product decisions. It is a review sidecar only and does not change the active catalog.

## Locked input

```text
data/grammar/naer-top-1000-activation-review-batch-1.csv
```

The source screening report remains locked to:

```text
bfd7022c957ac03e4263843753b2979b5e6d8c09ff54e1c55302b59404c19d4b
```

The review follows commonness order exactly. It does not add a second ranking, quota, template-coverage score, or hand-selected vocabulary lane.

## Decisions

| Order | Text | Decision | Reviewed annotation or hold boundary |
|---:|---|---|---|
| 26 | 名 | held | dominant classifier use needs a quantified-noun construction |
| 27 | 認為 | held | normally selects a clausal proposition complement |
| 28 | 重要 | approved | `adjectival-predicate`, frame `adjectival` |
| 29 | 美國 | approved | `subject;object`, frame `none` |
| 30 | 其 | held | literary possessive/determiner requires following nominal context |
| 31 | 中國 | approved | `subject;object`, frame `none` |
| 32 | 政府 | approved | `subject;object`, frame `none` |
| 33 | 社會 | approved | `subject;object`, frame `none` |
| 34 | 世界 | approved | `subject;object`, frame `none` |
| 35 | 活動 | approved | dominant nominal use: `subject;object`, frame `none` |
| 36 | 公司 | approved | `subject;object`, frame `none` |
| 37 | 民眾 | approved | `subject;object`, frame `none` |
| 38 | 不同 | approved | `adjectival-predicate`, frame `adjectival` |
| 39 | 關係 | approved | `subject;object`, frame `none` |
| 40 | 能夠 | approved | `modal`, frame `modal` |
| 41 | 不能 | approved | `modal`, frame `modal` |
| 42 | 事情 | approved | `subject;object`, frame `none` |
| 43 | 最後 | approved | `temporal`, frame `none` |
| 44 | 國家 | approved | `subject;object`, frame `none` |
| 45 | 方式 | approved | `subject;object`, frame `none` |
| 46 | 必須 | approved | `modal`, frame `modal` |
| 47 | 件 | held | classifier use needs a quantified-noun construction |
| 48 | 請 | held | polite marker, ask, and invite uses require different constructions |
| 49 | 走 | approved | `intransitive-predicate`, frame `intransitive` |
| 50 | 環境 | approved | `subject;object`, frame `none` |

Result:

```text
reviewed  25
approved  20
held       5
```

Decision digest:

```text
5cf787b91d5dcaaa4a81cd13393e9fdaaf1be8a8c1a399e3525405b21e469743
```

## Approval boundary

The approved rows use only existing schema values:

```text
subject;object + frame none
 temporal + frame none
adjectival-predicate + frame adjectival
modal + frame modal
intransitive-predicate + frame intransitive
```

All approved rows retain `lexical-prompt`. Approval means the lexical item can safely fill an existing complete template; it does not authorize activation in this PR.

The five held rows have concrete schema boundaries:

- `名` and `件` are classifier-heavy and need quantified-noun templates;
- `認為` needs a clausal complement;
- `其` depends on a following nominal phrase;
- `請` conflates discourse, request, and invitation constructions.

## Validation

```bash
python scripts/validate_activation_review_decisions.py
```

The shared validator now checks both reviewed slices while preserving `validate_files()` for the already-merged activation-1 migration.

## Non-goals

This review does not:

- modify active lexical or grammar catalogs;
- activate the twenty approved identities;
- add classifier, complement, possessive, request, or imperative templates;
- change readings, commonness, stage eligibility, selection, learner adaptation, diagnostics, or transition scoring;
- review orders 51–100.
