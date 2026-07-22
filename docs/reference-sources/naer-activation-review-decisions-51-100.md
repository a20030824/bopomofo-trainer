# NAER activation grammar review: batch orders 51–100

This review converts batch orders 51–100 from the committed activation-review batch into explicit product decisions. It is a review sidecar only and does not change the active catalog. It also closes out the locked 100-candidate batch: orders 1–100 are now fully reviewed.

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
| 51 | 文化 | approved | `subject;object`, frame `none` |
| 52 | 大陸 | approved | `subject;object`, frame `none` |
| 53 | 大學 | approved | `subject;object`, frame `none` |
| 54 | 目前 | approved | `temporal`, frame `none` |
| 55 | 部分 | approved | `subject;object`, frame `none` |
| 56 | 無法 | held | dominant use heads a clausal/verb complement, not in the auxiliary review lane |
| 57 | 日本 | approved | `subject;object`, frame `none` |
| 58 | 未來 | approved | `subject;object`, frame `none` |
| 59 | 學校 | approved | `subject;object`, frame `none` |
| 60 | 經濟 | approved | `subject;object`, frame `none` |
| 61 | 當時 | approved | `temporal`, frame `none` |
| 62 | 過程 | approved | `subject;object`, frame `none` |
| 63 | 感覺 | approved | `subject;object`, frame `none` |
| 64 | 結果 | approved | `subject;object`, frame `none` |
| 65 | 指出 | held | predicate normally selects a clausal complement |
| 66 | 後來 | approved | `temporal`, frame `none` |
| 67 | 機會 | approved | `subject;object`, frame `none` |
| 68 | 條 | held | dominant classifier use needs a quantified-noun construction |
| 69 | 放 | held | mixes placement, release, and fixed-expression uses |
| 70 | 故事 | approved | `subject;object`, frame `none` |
| 71 | 變成 | approved | `transitive-predicate`, frame `transitive` |
| 72 | 其中 | held | predominantly a partitive oblique expression, not a plain noun |
| 73 | 先生 | approved | `subject;object`, frame `none` |
| 74 | 同時 | approved | `temporal`, frame `none` |
| 75 | 使 | held | causative use requires an object plus a following predicate |
| 76 | 決定 | held | mixes nominal decision and clause-complement deciding uses |
| 77 | 市場 | approved | `subject;object`, frame `none` |
| 78 | 中心 | approved | `subject;object`, frame `none` |
| 79 | 國際 | held | dominant attributive-modifier use, minimal subject/object evidence |
| 80 | 狀況 | approved | `subject;object`, frame `none` |
| 81 | 身體 | approved | `subject;object`, frame `none` |
| 82 | 項 | held | dominant classifier use needs a quantified-noun construction |
| 83 | 生命 | approved | `subject;object`, frame `none` |
| 84 | 起來 | held | bound verb-complement particle, not a standalone predicate |
| 85 | 誰 | held | interrogative pronoun requires question-aware templates |
| 86 | 歷史 | approved | `subject;object`, frame `none` |
| 87 | 電影 | approved | `subject;object`, frame `none` |
| 88 | 人員 | approved | `subject;object`, frame `none` |
| 89 | 隻 | held | dominant classifier use needs a quantified-noun construction |
| 90 | 令 | held | causative use requires an object plus a following predicate |
| 91 | 家庭 | approved | `subject;object`, frame `none` |
| 92 | 經驗 | approved | `subject;object`, frame `none` |
| 93 | 是否 | held | interrogative complementizer, fits no reviewed predicate role |
| 94 | 塊 | held | dominant classifier use needs a quantified-noun construction |
| 95 | 能力 | approved | `subject;object`, frame `none` |
| 96 | 小時 | held | duration noun normally requires a preceding numeral |
| 97 | 政治 | approved | `subject;object`, frame `none` |
| 98 | 企業 | approved | `subject;object`, frame `none` |
| 99 | 總統 | approved | `subject;object`, frame `none` |
| 100 | 進入 | approved | `transitive-predicate`, frame `transitive` |

Result:

```text
reviewed  50
approved  34
held      16
```

Decision digest:

```text
ac83f086ff4a1ed7dea989079d41215a19846845296c347b337533d0a79ce0b2
```

## Approval boundary

The approved rows use these existing schema values:

```text
subject;object + frame none
temporal + frame none
transitive-predicate + frame transitive
```

All approved rows retain `lexical-prompt`. Approval means the lexical item can safely fill an existing complete template; it does not authorize activation in this PR.

This slice is the first to approve the `transitive` predicate frame. `transitive-predicate` was already a declared product role (see `docs/grammar-aware-practice.md`) and is already used by active entries such as `使用`, but no prior activation-review slice had approved it, so `validate_approved` did not yet check it. This review adds that check, requiring `roles == ["transitive-predicate"]` for an approved `transitive` frame, mirroring the existing `intransitive` check. `變成` and `進入` are approved under it because their UD evidence is `object-bearing-only` with no mixed-frame ambiguity.

The sixteen held rows have concrete schema boundaries:

- `條`, `項`, `隻`, `塊` are classifier-heavy and need quantified-noun templates, matching the earlier `名`/`件` boundary;
- `使`, `令` are causative predicates needing an object-plus-complement construction, matching the earlier `讓` boundary;
- `無法`, `指出`, `起來`, `是否` head or attach to a clausal/verb complement rather than filling a plain predicate slot;
- `放`, `決定` mix distinct uses (placement/release/fixed-expression; nominal/clausal) that would require separate review;
- `其中`, `國際`, `小時` are dominated by oblique, attributive, or duration-quantifier uses rather than plain subject/object use;
- `誰` is an interrogative pronoun, matching the earlier `什麼` boundary.

## Validation

```bash
python scripts/validate_activation_review_decisions.py
```

The shared validator now checks all three reviewed slices while preserving `validate_files()` and `validate_second_files()` for the already-merged migrations.

## Non-goals

This review does not:

- modify active lexical or grammar catalogs;
- activate the thirty-four approved identities;
- add classifier, complement, causative, interrogative, or partitive-oblique templates;
- change readings, commonness, stage eligibility, selection, learner adaptation, diagnostics, or transition scoring;
- review candidates beyond order 100 of this locked batch.
