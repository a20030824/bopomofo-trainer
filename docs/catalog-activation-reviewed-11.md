# Activate the first eleven reviewed NAER entries

This migration promotes the first `approved-existing-schema` decisions into the
active product catalog. It changes the catalog from 49 to 60 entries without
changing grammar templates, stage rules, evaluation count, or learner policy.

## Activated identities

```text
我 他 你 她 它 自己 他們 地方 孩子 一樣 不會
```

The source of truth is:

```text
data/grammar/naer-activation-review-batch-1-decisions-1-25.csv
```

Its locked decision digest is:

```text
1e0198d15281bceb0b47a9b45064025bb747153a49acf1bde8ca7115d5d78e53
```

Only rows marked `approved-existing-schema` are eligible. The fourteen held
rows in the same slice remain absent from the active catalog.

## Generated migration

Run:

```bash
npm run catalog:activate-reviewed-11
```

The command reads only committed, candidate-scoped artifacts. It does not open
the ignored NAER workbook, MOE dictionary archives, CC-CEDICT archive, or UD
treebank files.

It updates:

```text
data/source/words.sample.csv
data/source/grammar.sample.csv
data/provenance.csv
data/commonness/naer-1141208-active-catalog-rows.json
data/readings/moe-concised-2014_20260626-active-catalog.json
data/readings/moe-revised-2015_20260625-active-catalog-fallback.json
data/identity/cedict-active-catalog-hints.json
```

It also creates:

```text
data/grammar/naer-reviewed-catalog-activation-1-report.json
```

Every output is serialized with LF line endings. The report locks each generated
file by SHA-256 and has its own deterministic content digest.

## Lexical activation

The eleven lexical rows are appended in activation-review order with:

```text
frequency_band  1
tags            general
status          reviewed
provenance      local:activation-review-v1
```

`frequency_band` remains the existing coarse eligibility field. The migration
does not redefine bands or change stage advancement. NAER rank and per-million
frequency evidence continue to come from the active commonness projection.

## Grammar activation

The reviewed decisions are copied without inference:

| Texts | Roles | Predicate frame |
|---|---|---|
| 我、他、你、她、它、自己、他們、地方、孩子 | `subject;object` | `none` |
| 一樣 | `adjectival-predicate` | `adjectival` |
| 不會 | `modal` | `modal` |

All eleven use `lexical-prompt` standalone behavior. No role or predicate frame
is inferred from UD tags during activation.

## Reading authority

All eleven new identities have unique exact-headword readings in the committed
MOE Concised top-1,000 projection. After activation the locked authority
distribution is:

```text
MOE Concised   52
MOE Revised     2
CC-CEDICT       4
manual          2
total          60
```

The existing unresolved-after-MOE set remains:

```text
台灣 很好 想要 東西 看到 聽到
```

Therefore the Revised fallback target set and CC-CEDICT target set do not gain
new identities. Only their active-catalog counts and the Concised projection
checksum are updated.

The provisional source reading for `我們` remains the only reading changed by
the active resolver.

## Commonness

Commonness rows for the eleven identities are copied from:

```text
data/lexicon/naer-1141208-top-1000-candidates.csv
```

The active projection must contain exactly the same 60 identities as the lexical
catalog. It remains ordered by ascending NAER general rank.

## Interruption and reruns

Each tracked artifact must be in one of two complete states:

```text
baseline   49 active entries
activated  60 active entries containing all eleven reviewed identities
```

A file containing only part of the eleven-identity tranche is rejected. Files
may independently be in the baseline or activated state, so rerunning the
command repairs an interrupted multi-file write. Running the command again after
a complete activation is idempotent.

## Validation

The Python tests check:

- rejection of partial activation;
- exact reviewed lexical and grammar rows;
- commonness identity equality;
- Concised accepted-row counts;
- unchanged Revised and CC-CEDICT target sets;
- committed output checksums when the activation report is present.

Normal PR checks additionally compile the resolved 60-entry catalog, synchronize
the grammar sidecar, apply commonness, reserve five evaluation entries, run the
catalog validator, and build the browser application.

## Non-goals

This migration does not:

- activate `讓`, `年`, `被`, `什麼`, `時候`, `等`, `次`, `覺得`, `天`,
  `月`, `一些`, `元`, `裡面`, or `歲`;
- add passive, causative, interrogative, classifier, quantified-unit, temporal
  modifier, or complement templates;
- change the five-entry evaluation holdout;
- change commonness scoring, stage eligibility, exercise selection, bounded
  learner adaptation, token diagnostics, or transition scoring;
- infer grammar from dictionary glosses;
- commit any complete official source file.
