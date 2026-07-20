# Relational catalog analysis

## Purpose

The analyzer answers what the current text data can support before a curriculum selects objectives or a composer builds practice sequences. It does not decide that every grammar-supported relation deserves equal training priority.

The current snapshot uses 49 provisional entries, the existing deterministic 44/5 training/evaluation partition, guided mode, and the Taiwan Standard layout.

## Exact occurrence rules

- Every token position creates a binding occurrence.
- Every adjacent pair inside one syllable creates one directional transition occurrence.
- No transition crosses a syllable or entry boundary.
- Every occurrence retains entry ID, syllable and token position, frequency band, tags, provenance, and partition.
- Binding occurrences also mark whether they are the first token of an entry, so later estimators can distinguish structural availability from the current browser adapter's entry-boundary policy.
- Physical key codes do not enter the semantic relation index.

## Relation universe

The binding universe contains all 37 Bopomofo symbols and five explicit tones: 42 nodes.

The transition universe is generated from the repository's supported standalone-syllable grammar. It contains every exact adjacent pair that occurs in at least one grammar-supported syllable body, plus the final Bopomofo symbol to each of five tones. This is a grammar-supported universe for this repository, not a claim that every relation is equally common in natural text.

## First 49-entry snapshot

```text
entries                 49
training / evaluation   44 / 5
syllables               100
binding occurrences     318
transition occurrences  218

binding relations       42 / 42 observed
transition relations    112 / 340 observed
```

Binding support states:

```text
supported       29
concentrated    12
rare-only        1
unsupported      0
evaluation-only  0
```

Transition support states:

```text
supported        22
concentrated     81
rare-only         6
evaluation-only   3
unsupported     228
```

`Supported` currently means at least three distinct training entries, at least one frequency-band-1 training entry, and no single training entry contributing more than half of the occurrences. The thresholds are an analysis policy, not a curriculum mastery threshold.

## Immediate findings for text sourcing

All binding nodes occur somewhere, but several are lexically fragile.

The following bindings are concentrated in fewer than three training entries or dominated by one entry:

```text
ㄅ ㄆ ㄈ ㄏ ㄖ ㄘ ㄙ ㄚ ㄛ ㄟ ㄡ ㄦ
```

`ㄔ` is rare-only in the current training data.

These are more actionable first targets for additional common words than indiscriminately filling all 228 unsupported transitions.

The transition graph is much sparser. Only 22 of 340 grammar-supported transitions currently have broad training support. Eighty-one observed transitions remain concentrated, usually because the sample contains only one supporting word. The 228 unsupported transitions require a later natural-language frequency layer before deciding which gaps matter.

## Held-out partition failure

The existing product partition preserves token-level raw, binding, and motor support, but it was not designed to preserve directional transition support. Three relations become evaluation-only:

```text
ㄎ → ㄜ       from 可以
ㄜ → 三聲    from 可以
ㄩ → ㄥ       from 使用
```

This means the held-out partition is valid for the old binding-only product baseline but not automatically valid for relational transition experiments. Phase 7 composition and evaluation must partition against relation objectives, or add enough training words before reserving those paths.

## Example of exact retrieval

The relation `ㄓ → ㄨ` is supported only by exact adjacent positions in:

```text
中文
建築
注音
```

A word containing both symbols in another order or in different syllables would not qualify.

## How this changes finding words

New text should not be added as an undirected list of common words. Every candidate source row should be evaluated for marginal relational contribution:

- which unsupported or concentrated binding nodes it broadens;
- which exact directional transitions it adds;
- whether it supplies a common-word alternative to rare-only support;
- whether it reduces dependence on one lexical family;
- whether it preserves training support after held-out partitioning;
- whether its pronunciation and frequency evidence are traceable.

A later corpus-ranking stage should combine natural-language frequency with marginal relation coverage. Grammar support alone is too broad to rank the 228 missing transitions.

## Generated outputs

```bash
npm run catalog:relations
```

writes deterministic files:

```text
data/generated/relational-catalog.json
data/generated/relational-catalog.txt
```

The JSON retains the complete occurrence index and support summaries. The text output is a compact diagnostic view. Confusion contrast pools are intentionally not fabricated in this phase; they require a separate contrast-analysis policy over the indexed entries.
