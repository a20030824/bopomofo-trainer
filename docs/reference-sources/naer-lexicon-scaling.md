# NAER lexicon scaling and eligibility reporting

## Scope

The pinned NAER `通用詞頻表` contains 163,701 data rows. The historical committed projection intentionally selected the continuous general-rank prefix `1..1000` and rejected the entire batch if any selected lexical text was not pure Han or normalized to a duplicate.

That strict behavior remains the default because it protects the reproducibility of the existing top-1,000 artifacts. A separate report mode now supports larger audits without treating candidate-content anomalies as source corruption.

## Source integrity versus candidate eligibility

The pipeline must keep these boundaries separate.

### Fail fast: source integrity

The projection still stops when any of the following changes:

- workbook checksum;
- workbook sheet name;
- workbook dimension;
- header schema;
- numeric rank or frequency cell shape;
- requested source rank prefix continuity.

These failures mean the pinned source contract or adapter assumptions changed. They must not be downgraded to ordinary exclusions.

### Report and continue: candidate eligibility

With `--invalid-row-policy report`, the projection excludes an individual candidate and records it when:

- lexical text is missing or not a string;
- normalization produces an empty string;
- normalized text contains non-Han characters;
- normalized text duplicates an earlier eligible rank.

The earliest eligible normalized identity wins. Later duplicates retain their original rank and point to `duplicateOfGeneralRank` in the report.

Excluded source ranks are not renumbered. The accepted candidate CSV therefore preserves NAER general rank and may contain gaps.

## Outputs

A report-mode run writes three artifacts:

1. accepted candidate CSV;
2. candidate manifest;
3. eligibility report.

The eligibility report records:

- requested rank limit;
- source prefix count;
- eligible count;
- excluded count;
- counts by exclusion reason;
- every excluded rank, source physical row, raw lexical value, normalized value when available, and duplicate origin when relevant;
- a deterministic digest over the summary and exclusions.

The repository command for the first large audit is:

```bash
npm run lexicon:naer-top-10000-audit
```

The official workbook remains local. This command is not part of ordinary CI and does not make the generated top-10,000 artifacts authoritative by itself.

## Remaining blockers after candidate projection

The eligibility report removes only the first scaling blocker. The rest of the pipeline still contains historical top-1,000 assumptions.

### 1. Candidate rank consumers assume a dense prefix

`summarize-naer-reading-coverage.py` currently requires accepted candidate ranks to equal `1..N`. Report-mode candidates preserve source ranks and can contain gaps, so the reading coverage loader must be changed to accept unique positive source ranks without reindexing them.

Rank bucket generation must also use the maximum source rank rather than accepted candidate count. Otherwise a top-10,000 audit with exclusions near the front can silently omit high-rank accepted candidates from its final bucket.

### 2. Reading projections are top-1,000-scoped

The MOE Concised, MOE Revised, and CEDICT projection defaults, filenames, candidate counts, and lineage currently target the committed top-1,000 set.

Before activation can scale, these adapters need:

- parameterized candidate inputs and output paths;
- explicit candidate-manifest lineage;
- exact partition checks against the eligible candidate set;
- deterministic handling of a much larger ambiguous or unmatched reading queue;
- no automatic choice among heteronyms or ambiguous CEDICT records.

Reading ambiguity is expected to become the largest human-review queue.

### 3. UD syntax evidence is checksum-locked to exactly 1,000 candidates

The v2 UD adapter currently hardcodes:

- candidate count `1000`;
- canonical candidate CSV checksum;
- top-1,000 input and output paths.

It must be generalized to validate a candidate manifest and candidate digest rather than one historical count and checksum. The syntax evidence projection itself can remain candidate-scoped and deterministic.

Larger candidate sets will also increase evidence artifact size. Artifact size, Git diff reviewability, and GitHub storage must be measured before committing a full top-10,000 evidence file.

### 4. Activation review is tied to historical batch constants

The activation batch pipeline currently hardcodes:

- candidate count;
- active catalog row count;
- reading coverage digest and review count;
- UD evidence and coverage digests;
- old top-1,000 paths;
- a small set of review lanes;
- exclusions based on legacy template support.

This is incompatible with mass activation and the formal syntax architecture.

The replacement must separate:

- **candidate eligibility**: source-ranked text can enter the candidate set;
- **catalog activation**: exact text and reading identity is authoritative;
- **runtime admission**: at least one formal syntax profile can participate in a supported construction.

A word must not be rejected from the catalog merely because the current runtime grammar cannot yet realize one of its profiles.

### 5. Historical activation scripts are batch-specific

The current activation scripts encode exact batch sizes, expected checksums, and immutable historical report contracts. They should remain replayable historical tools rather than being edited into a generic mass importer.

A new manifest-driven activation tool should create a new generation and report:

- newly activated identities;
- already active identities;
- unresolved readings;
- conflicting or duplicate identities;
- active entries without UD evidence;
- syntax profiles not admitted to runtime;
- catalog and generation digests.

### 6. Formal syntax coverage is generated from the active catalog

Formal syntax projection currently starts from active catalog entries. Increasing only the candidate set will not change NUM or other UPOS coverage until reading-resolved identities are actually activated.

After each activation generation, regenerate:

- syntax profiles;
- UPOS and function distributions;
- unrealizable-profile report;
- deterministic coverage artifacts.

Grammar changes should be based on repeated profile clusters, not one exceptional token.

### 7. Product and CI scale are still unmeasured

Before enabling thousands of active entries in the browser runtime, measure:

- compiled catalog size;
- initial JavaScript and generated data size;
- app catalog compile time;
- source-adapter CI duration;
- formal profile projection and coverage time;
- candidate selection latency and memory;
- review artifact size and usability.

Do not infer that successful source projection means the product can load the full set efficiently.

## Recommended implementation order

1. Run the top-10,000 eligibility audit locally and commit only the report after reviewing redistribution and artifact-size boundaries.
2. Make reading coverage and its source adapters accept sparse source ranks and manifest-linked candidate sets.
3. Generalize UD v2 evidence from fixed top-1,000 constants to candidate-manifest lineage.
4. Build a new generation-based catalog activation tool; preserve historical activation scripts unchanged.
5. Activate reading-resolved candidates in bounded rank bands and regenerate formal syntax coverage after every generation.
6. Use the resulting profile clusters to decide missing constructions such as bare quantity noun phrases.
7. Measure browser and CI costs before making the expanded catalog the product default.

## Non-goals of the current change

This change does not:

- generate or commit the actual top-10,000 artifacts;
- relax source checksum or schema validation;
- resolve readings;
- activate catalog entries;
- modify formal grammar;
- enable expanded vocabulary in the browser runtime.
