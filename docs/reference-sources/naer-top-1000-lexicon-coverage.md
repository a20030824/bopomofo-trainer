# NAER top-1,000 lexicon candidate coverage

This stage projects a ranked lexical prefix from the pinned NAER general-frequency
workbook and audits pronunciation coverage before changing the product catalog.
It is an evidence and review stage, not a product import.

## Source lock

| Source | Version | SHA-256 |
| --- | --- | --- |
| NAER 通用詞頻表 | `1141208` | `bfd3b73938e115ae39a44c5e11c97135c09939cf598157cb2fe0b33c4302de75` |
| MOE Concised Dictionary | `2014_20260626` | `fc83d27eb3fbf6fcfdb791e7d05ef60946b58ef8e8857ed165b612217b392806` |
| MOE Revised Dictionary | `2015_20260625` | `64003a98fcc7097940e5a536c999bc08ba7c07e2c1be66448f01bf1ae10a53fc` |
| CC-CEDICT manual release | `2026-07-21T11:22:36Z` | `a20e3d9a5d5c3ae42d7539b9955cf2c545611f361e1be4515c560e04505eecf2` |

The official bulk files stay under `data/external/` and are ignored. Only the
ranked prefix and candidate-scoped dictionary evidence are committed.

## Candidate boundary

The NAER adapter selects the continuous general-rank prefix `1..1000` from
columns A/B/D/G:

- A: general rank;
- B: lexical text;
- D: written occurrences per million;
- G: spoken occurrences per million.

The selected prefix contains:

| Length | Count |
| --- | ---: |
| 1 character | 347 |
| 2 characters | 639 |
| 3 characters | 14 |
| **Total** | **1,000** |

All 1,000 normalized texts are unique and pure Han. The candidate digest is:

```text
55274132835ac713e09396b039c64b2a6dc2ed49af497af517c61f30a9669740
```

## Reading authority order

1. MOE Concised unique exact-headword reading;
2. MOE Revised unique exact-headword fallback;
3. unique CC-CEDICT record converted later by the deterministic pinyin adapter;
4. explicit reviewed manual resolution.

A lower source never replaces an accepted higher-source reading. Ambiguous rows
remain unresolved; the pipeline does not choose the first dictionary row or
assume a statistically most common reading.

## Coverage result

| Resolution source | Count |
| --- | ---: |
| MOE Concised unique | 829 |
| MOE Revised unique fallback | 29 |
| CC-CEDICT unique fallback | 53 |
| **Automatically resolvable** | **911** |
| CC-CEDICT ambiguous | 85 |
| Unmatched | 4 |
| **Review required** | **89** |

The four unmatched lexical texts are:

```text
很多
更多
第三
太多
```

The review burden is concentrated near the top of the curriculum: ranks 1–100
contain 30 ambiguous entries. Most are common one-character or function-word
identities such as `的`, `個`, `了`, `都`, `說`, `會`, and `要`. Their intended
reading depends on lexical identity and grammatical use, so automatic
headword-first selection would be unsafe.

## Rank-bucket coverage

| Rank range | Concised | Revised | CEDICT unique | Ambiguous | Unmatched |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1–100 | 66 | 0 | 4 | 30 | 0 |
| 101–250 | 122 | 4 | 8 | 15 | 1 |
| 251–500 | 208 | 10 | 14 | 17 | 1 |
| 501–1000 | 433 | 15 | 27 | 23 | 2 |

The complete rank-ordered review queue and source evidence live in
`data/lexicon/naer-1141208-top-1000-reading-coverage.json`. Its deterministic
digest is:

```text
c85651b20a7feeef0ae91d1cd690bf4444e61d546f768c3450e27b085b434403
```

## Reproduction

Place the locked sources under `data/external/`, then run:

```powershell
npm run lexicon:naer-top-1000
```

That command performs the ranked NAER projection, both MOE projections, the
local-only CEDICT projection, and the final strict coverage summary. The normal
source-adapter test suite recomputes the coverage summary from committed
candidate-scoped inputs and requires exact artifact equality once those outputs
are present.

## Deferred work

This stage deliberately does not:

- add the 1,000 candidates to the runtime catalog;
- create 89 bulk manual overrides;
- infer part of speech or grammar roles from CC-CEDICT English definitions;
- change commonness scoring, stage eligibility, exercise selection, learner
  adaptation, or transition behavior.

The next stage should review curriculum inclusion and lexical identity for the
89 unresolved entries before grammar annotation or runtime expansion.
