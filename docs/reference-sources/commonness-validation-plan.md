# Commonness-model validation plan

## Goal

Define how a future commonness implementation can be verified offline, deterministically, and without pretending that one corpus or one score is ground truth.

This plan validates:

- source acquisition and provenance;
- transform correctness;
- null and zero semantics;
- spoken/written behavior;
- list-level coverage calculations;
- optional domain breadth;
- cross-source agreement;
- rank stability and explainability.

It does not validate lesson quality or learner outcomes. Those require separate pedagogical studies.

## Gate 1: inspect the real workbook before coding an adapter

For each locally downloaded source version, produce an inspection report containing:

- landing URL and resolved download URL;
- retrieval timestamp, filename, byte size, and SHA-256;
- workbook format and sheet names;
- hidden sheets, merged cells, formulas, and header rows;
- exact column labels and observed cell types;
- physical row count and candidate data-row count;
- blank, duplicate, and malformed row counts;
- frequency minimum, maximum, zero count, null count, and non-numeric count;
- apparent stable identity fields;
- examples of variants, heteronyms, numbered homographs, and punctuation-bearing entries;
- any workbook notes defining units or aggregation.

No source-specific production adapter should be implemented before this report is reviewed. Research code must not guess column names from the public web table.

## Gate 2: hand-authored structural fixtures

Build small fixtures that imitate only observed structure, never copied official rows. Required cases:

1. both spoken and written values present;
2. true zero in either mode;
3. missing spoken value;
4. missing written value;
5. both values missing;
6. negative, boolean, infinite, and non-numeric values;
7. duplicated source identity;
8. unresolved slash variants;
9. one spelling with multiple readings;
10. identical text/reading from two sources;
11. narrow-domain and broad-domain count vectors;
12. ties requiring deterministic identity tie-breakers.

Each fixture must state why it is synthetic and use fictional source URLs.

## Transform invariants

For the proposed `ln(1+x)` percentile-capped transform, test:

### Determinism

Identical input bytes, source version, model version, percentile algorithm, and configuration produce byte-for-byte identical serialized output and digest.

### Monotonicity

For valid observed values `a <= b`:

```text
strength(a) <= strength(b)
```

### Boundary behavior

- observed `0` transforms to `0`;
- values at or above the cap transform to `1`;
- no valid value produces `NaN`, infinity, or a value outside `[0, 1]`;
- `null` remains `null` and never transforms to `0`;
- negative or non-finite values are rejected with structured reasons.

### Cap auditability

The output records:

- source version;
- valid observation count;
- requested percentile;
- exact percentile algorithm;
- resulting cap;
- transform version.

A cap change must change the model digest.

## Cross-mode invariants

Let `S` and `W` be transformed strengths.

### General reach

For equal default weights:

- swapping `S` and `W` leaves `generalReach` unchanged;
- increasing either non-null input cannot reduce `generalReach`;
- if either mode is missing, complete `generalReach` is `null`;
- an observed zero remains eligible and is not treated as missing.

### Cross-mode commonness

For `sqrt(S * W)`:

- result is symmetric;
- result is zero if either observed strength is zero;
- result is `null` if either observation is missing;
- result never exceeds the larger input;
- result equals the input when `S == W`.

### Mode descriptors

- `modeBalance` is in `[0, 1]`;
- `modeBias` is in `[-1, 1]`;
- swapping modes negates `modeBias` and preserves `modeBalance`;
- a large bias is reported, not silently used as a universal penalty.

## Coverage-list invariants

Using a frozen eligible identity set:

- sorting is descending by the declared metric;
- ties use the published deterministic keys;
- cumulative mass never decreases;
- marginal gains sum to final cumulative mass within pinned numeric tolerance;
- adding an ineligible unresolved variant does not change eligible coverage;
- split variants cannot each inherit the same aggregate source frequency;
- output labels coverage as `eligible_source_mass_coverage` unless the corpus universe and tokenization justify a stronger claim.

Run the same fixture in multiple input orders. Canonical sorted output and digest must remain identical when the model declares input-order independence.

## Domain-breadth invariants

For normalized entropy over a declared domain universe:

- equal positive counts across all domains produce breadth `1`;
- all mass in one domain produces breadth `0`;
- permuting domain order does not change the result;
- adding a declared zero-count domain changes the denominator intentionally and must be versioned;
- missing domain evidence produces `null`;
- a pedagogical situation label alone cannot produce a breadth score.

## Cross-source validation

Use synthetic source pairs to verify:

- measurements are normalized within their own source versions before comparison;
- weighted median and spread are independent of input order;
- one source cannot silently override another;
- identity or tokenization incompatibility blocks aggregation with a structured reason;
- source version changes affect digest and are visible in output;
- agreement metrics retain source IDs, versions, and raw values.

## Rank sensitivity analysis

Before adopting any production weights or transform parameters, compare alternatives using:

- Spearman rank correlation;
- Kendall rank correlation;
- top-100, top-500, and top-1,000 overlap;
- rank displacement distributions;
- coverage curves;
- spoken-biased and written-biased audit subsets;
- zero-frequency and missing-frequency audit subsets;
- function-word, content-word, proper-name, variant, and heteronym review samples.

Required parameter comparisons:

- percentile caps such as 95, 99, and 99.5;
- spoken/written weights such as 0.5/0.5, 0.7/0.3, and 0.3/0.7;
- arithmetic versus geometric cross-mode combination;
- inclusion versus exclusion of low-confidence identities;
- source-version changes.

The purpose is not to select the parameter set with the smoothest graph. The chosen configuration must match a declared product use case and preserve interpretable behavior.

## Illustrative audit expectations

Using public NAER query examples only as review prompts:

- `的` should appear extremely high in both spoken and written views and show strong balance;
- `現在` should remain high while showing positive spoken bias;
- `颱風` should show a stronger spoken bias and lower cross-mode score than a similarly frequent balanced item;
- `姓名` should remain low by corpus commonness even if pedagogical metadata places it early.

Do not hard-code these live values into production tests. Convert only reviewed structural patterns into fictional fixtures.

## Regression reports

Every model run intended for review should produce:

- source provenance digest;
- model/configuration digest;
- eligible and excluded row counts;
- exclusion counts by machine-readable reason;
- frequency null/zero summaries by mode;
- transform caps and observation counts;
- top and bottom ranked examples;
- largest mode biases;
- largest cross-source disagreements;
- coverage milestones;
- deterministic replay result;
- rank-difference report against the previous source/model version.

## Exact failure policy

The future implementation must fail the complete run for schema- or model-level uncertainty, including:

- no valid source version;
- missing required headers after source-specific inspection;
- insufficient observations to derive the declared cap;
- duplicate model/identity keys in canonical output;
- invalid configuration weights;
- non-deterministic tie-breaking;
- unsupported percentile algorithm.

It should queue individual row failures when the schema remains usable, including invalid frequencies, unresolved variants, or missing identity evidence.

## Open research questions

The following remain unresolved until the current binaries are downloaded and inspected locally:

1. What are the exact sheets and columns in `通用詞頻表 - 定稿1141208.xlsx`?
2. Does it contain separate spoken/written values, total frequency, rank, document frequency, dispersion, genre, or only a subset?
3. Are values per million, raw counts, rounded integers, or mixed representations?
4. What stable source identity, if any, survives source revisions?
5. Are slash variants aggregated into one frequency observation?
6. How are numbered homographs and heteronyms represented?
7. What corpus periods and tokenization versions underlie each table?
8. Is redistribution of original or derived rows permitted beyond personal/research use?
9. Can domain/document counts be acquired under compatible terms for dispersion analysis?
10. Should a future product optimize general reach, cross-mode breadth, spoken use, written use, or a user-selectable profile?

## Implementation go/no-go checklist

A production commonness PR may begin only when:

- the source workbook checksum and inspection report are pinned;
- source column semantics are verified;
- license/redistribution status is recorded;
- identity and variant policies are approved;
- transform and percentile algorithms are versioned;
- null/zero behavior is accepted;
- a synthetic regression suite covers the invariants above;
- the output remains a feature profile rather than an opaque teaching decision;
- the implementation owns paths distinct from the PR #32 importer unless an explicit contract request is approved.