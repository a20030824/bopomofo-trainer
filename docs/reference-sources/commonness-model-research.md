# Taiwan Mandarin commonness model research

## Purpose

This document defines a research model for measuring how broadly a Taiwan Mandarin lexical item is used. It deliberately separates **commonness** from **teaching priority**.

A word can be common but unsuitable for a specific exercise, or pedagogically important despite modest corpus frequency. Frequency evidence, pedagogical level, relational-skill coverage, pronunciation difficulty, and lesson composition must remain separate dimensions until a downstream policy explicitly combines them.

## Authoritative starting evidence

NAER's public graded-word query exposes spoken and written occurrences per million together with pronunciation, level, and situation metadata:

- https://coct.naer.edu.tw/word.jsp

NAER states that its graded word list used written-corpus frequency, coverage, and distribution evenness, selected words reaching about 90% corpus coverage, and then used spoken-corpus frequency plus experienced teacher judgment when adjusting levels:

- https://epaper.naer.edu.tw/edm?content_no=4093&edm_no=239&grp_no=1

Therefore, raw frequency is necessary but not sufficient for either broad commonness or pedagogical grading.

## Non-goals

This phase does not:

- approve candidates into the reviewed catalog;
- define a learner model or lesson-ranking policy;
- infer unobserved frequency as zero;
- merge orthographic variants or heteronyms without a reviewed identity rule;
- treat NAER level as a numeric proxy for corpus frequency;
- produce an unexplained universal score.

## Required input semantics

For each reviewed lexical identity, preserve the following evidence separately:

- `spokenPerMillion`: non-negative number or `null`;
- `writtenPerMillion`: non-negative number or `null`;
- source ID and source version;
- source row identity;
- source-provided spelling and reading;
- optional domain/document frequency observations;
- optional pedagogical level, core-word flag, and situation labels;
- normalization and identity decisions with machine-readable reasons.

### Zero is not missing

- `0` means the source measured the mode and observed no occurrences after its rounding/counting policy.
- `null` means no usable measurement was supplied.

A missing spoken value must not silently borrow the written value, and vice versa.

## Why raw frequency cannot be ranked directly

Lexical frequencies are strongly heavy-tailed. For example, the public NAER table shows extremely high values for function words such as `的`, while many useful content words occupy a much narrower lower range. Summing raw spoken and written frequencies would let a few extreme values dominate every downstream comparison.

It would also hide mode differences. Examples visible in the public query system include:

- `的`: 62,578 spoken / 62,002 written — extremely high and balanced;
- `現在`: 2,365 spoken / 884 written — high but spoken-biased;
- `颱風`: 280 spoken / 14 written — materially spoken-biased;
- `姓名`: 3 spoken / 22 written — low overall and written-biased despite appearing at an early pedagogical level.

These values are illustrative observations from the web query system, not committed source fixtures.

## Versioned frequency transform

For each mode `m`, define a source-version-specific cap from all valid non-null values:

```text
cap_m = percentile(valid_values_m, 99)
```

The percentile algorithm must be pinned in code and tests. A recommended deterministic choice is nearest-rank over values sorted numerically ascending.

Transform an observed frequency `x` to a bounded strength:

```text
strength_m(x) = min(1, ln(1 + x) / ln(1 + cap_m))
```

Properties:

- monotonic for non-negative `x`;
- preserves `0 -> 0`;
- reduces extreme-value dominance;
- caps only the transformed display/ranking strength, not the retained raw value;
- changes intentionally when the source version or cap changes.

If fewer than a configured minimum number of valid observations exist, the transform must fail with a structured reason rather than fall back to an arbitrary constant.

Required audit fields:

- cap value;
- percentile and percentile algorithm;
- valid observation count;
- source ID/version;
- transform version.

## Core output features

Let `S` be transformed spoken strength and `W` transformed written strength.

### Spoken commonness

```text
spokenCommonness = S
```

Reason: `observed_spoken_frequency_log_scaled`.

### Written commonness

```text
writtenCommonness = W
```

Reason: `observed_written_frequency_log_scaled`.

### General reach

When both modes exist and the target application has no declared mode preference:

```text
generalReach = 0.5 * S + 0.5 * W
```

The weights are policy inputs and must be versioned. A speech-oriented product may declare a different pair, but it must not reuse the same score-version identifier.

When either mode is missing, `generalReach` is `null`; an observed-only diagnostic may be shown separately but must not masquerade as the complete score.

Reason: `weighted_cross_mode_reach` or `insufficient_cross_mode_evidence`.

### Cross-mode commonness

```text
crossModeCommonness = sqrt(S * W)
```

This geometric mean rewards words that are strong in both modes and penalizes one-mode concentration without treating an observed zero as missing.

When either mode is missing, the result is `null`.

Reason: `geometric_cross_mode_strength`.

### Mode balance

```text
modeBalance = 1 - abs(S - W)
modeBias = S - W
```

- `modeBalance` ranges from 0 to 1 when both observations exist.
- positive `modeBias` means spoken-biased;
- negative `modeBias` means written-biased.

These are descriptors, not penalties that should automatically lower commonness.

### Raw combined token probability

When per-million frequencies are comparable and a mode mixture `alpha` is declared:

```text
combinedPerMillion = alpha * spokenPerMillion
                   + (1 - alpha) * writtenPerMillion
```

This value can estimate marginal token coverage for a reviewed lexical identity. It must not be computed if either required observation is missing, and it must not be summed across unresolved overlapping variants.

## Coverage contribution

Coverage is a property of an ordered set, not only of one row.

For a frozen identity set and declared mode mixture:

1. compute `combinedPerMillion` for eligible reviewed identities;
2. sort descending;
3. break ties deterministically by normalized text, normalized reading, source ID, then source row ID;
4. compute cumulative frequency mass;
5. emit coverage at each rank and the marginal gain contributed by each item.

Required outputs include:

- ordered identity list version;
- cumulative per-million mass;
- cumulative share relative to the eligible mass;
- marginal contribution;
- exclusions and reasons.

Do not claim population coverage when the source omits portions of the lexicon, aggregates variants, or uses incompatible tokenization. In that case call it `eligible_source_mass_coverage`.

## Distribution and domain breadth

Raw frequency can be inflated by repeated use in a narrow genre or topic. If document- or domain-level counts are available, retain them rather than inferring breadth from a single situation label.

For `k` comparable domains with non-negative token counts `c_i`, let `p_i = c_i / sum(c)` and define normalized entropy:

```text
domainBreadth = -sum(p_i * ln(p_i)) / ln(k)
domainConcentration = 1 - domainBreadth
```

Conditions:

- at least two declared comparable domains;
- positive total count;
- zero-count domains remain in the declared domain universe;
- missing domain counts produce `null`, not zero breadth.

A source-provided pedagogical situation such as `交通、旅遊` is classification metadata, not evidence of corpus concentration.

## Cross-source agreement

When multiple independently sourced measurements exist, normalize within each source version first. For a feature such as spoken strength, report:

- weighted median normalized value;
- minimum and maximum;
- median absolute deviation;
- source count;
- source IDs/versions;
- disagreement reasons such as identity mismatch, time-period mismatch, or mode mismatch.

Do not average measurements that use unresolved different lexical identities or tokenization rules. Source disagreement is evidence to expose, not noise to erase.

## Pedagogical metadata remains separate

NAER level, core-word status, and situation classification may later inform teaching priority, but they must not be added directly to commonness.

Recommended separation:

```text
commonnessProfile = corpus-use evidence
pedagogicalProfile = level/core/situation evidence
practiceUtility = relational-skill and exercise evidence
teachingPriority = downstream policy over the three profiles
```

This avoids circular logic in which a word is judged common merely because experts placed it early, then the early placement is justified by the computed commonness.

## Variants, compounds, and heteronyms

Rows containing slash-separated spellings or readings cannot automatically become one rankable identity.

Required policy:

- retain source-row evidence unchanged;
- route unresolved alternatives through review;
- after review, either preserve one aggregate source identity with an explicit rule, or allocate evidence only when the source documents the allocation, or -- the reviewed rule adopted for real heteronyms (a shared source text with several distinct active readings, e.g. `了`) -- duplicate the one aggregate frequency onto every reading variant, since the figure describes the written/spoken word and not a specific pronunciation (see `commonness-model-v1.md`'s "Input boundary");
- never add split variant frequencies back together if they originated from the same aggregate measurement;
- never duplicate an aggregate frequency onto variants that are not reading variants of the same reviewed text (e.g. genuinely different words that happen to share a source row by data error).

## Confidence and completeness

Confidence should be categorical and reasoned rather than a false-precision decimal.

Suggested evidence tiers:

- `high`: both modes observed, provenance/checksum pinned, reviewed identity, current source version, no unresolved aggregation;
- `medium`: one required dimension is absent or only one source is available, but identity and provenance are sound;
- `low`: unresolved variant/heteronym, unclear source semantics, stale/unversioned acquisition, or incompatible source measurements.

Emit all applicable reasons, for example:

- `both_modes_observed`;
- `spoken_missing`;
- `written_missing`;
- `single_source_only`;
- `source_checksum_pinned`;
- `identity_reviewed`;
- `variant_aggregation_unresolved`;
- `domain_dispersion_unavailable`.

## Recommended rank products

Do not expose one list named simply `common words`. Produce purpose-specific views:

- spoken-common list: descending `spokenCommonness`;
- written-common list: descending `writtenCommonness`;
- cross-mode list: descending `crossModeCommonness`;
- general-reach list: descending versioned `generalReach`;
- domain-broad list: commonness plus observed `domainBreadth`;
- pedagogical candidate list: a later policy that combines commonness with pedagogical and relational-skill evidence.

Every list must publish its score version, eligibility filter, sort keys, tie-breakers, and null policy.

## Baseline machine-readable result shape

```json
{
  "identity": {
    "text": "現在",
    "reading": "ㄒㄧㄢ4 ㄗㄞ4"
  },
  "evidence": {
    "spokenPerMillion": 2365,
    "writtenPerMillion": 884,
    "sourceId": "naer:coct",
    "sourceVersion": "<pinned version>"
  },
  "features": {
    "spokenCommonness": 0.0,
    "writtenCommonness": 0.0,
    "generalReach": 0.0,
    "crossModeCommonness": 0.0,
    "modeBalance": 0.0,
    "modeBias": 0.0,
    "domainBreadth": null
  },
  "confidence": "medium",
  "reasons": [
    "observed_spoken_frequency_log_scaled",
    "observed_written_frequency_log_scaled",
    "domain_dispersion_unavailable"
  ],
  "modelVersion": "commonness-research-v1"
}
```

The numeric zeroes above are placeholders demonstrating structure, not computed values.