# NAER lexicon scaling and generation pipeline

## Scope

The pinned NAER `通用詞頻表` contains 163,701 data rows. The historical committed projection intentionally selected the continuous general-rank prefix `1..1000` and rejected the entire batch if any selected lexical text was not pure Han or normalized to a duplicate.

That strict behavior remains available because it protects replay of the existing top-1,000 artifacts. New vocabulary expansion uses manifest-linked generations instead of fixed counts, fixed checksums, dense accepted ranks, or top-1,000 filenames.

## Source integrity versus candidate eligibility

The pipeline keeps these boundaries separate.

### Fail fast: source integrity

Candidate projection still stops when any of the following changes:

- workbook checksum;
- workbook sheet name;
- workbook dimension;
- header schema;
- numeric rank or frequency cell shape;
- requested source rank-prefix continuity.

These failures mean the pinned source contract or adapter assumptions changed. They are not ordinary candidate exclusions.

### Report and continue: candidate eligibility

With `--invalid-row-policy report`, projection excludes and reports an individual candidate when:

- lexical text is missing or not a string;
- normalization produces an empty string;
- normalized text contains non-Han characters;
- normalized text duplicates an earlier eligible rank.

The earliest eligible normalized identity wins. Later duplicates retain their original rank and point to `duplicateOfGeneralRank`.

Excluded ranks are not renumbered. Every downstream generation therefore treats `naer_general_rank` as an external source rank, not as a dense array index.

## Candidate generation contract

`scripts/lexicon_candidate_set.py` is the shared loader for future lexical generations. It validates:

- unique non-empty candidate text;
- unique positive source rank;
- finite optional frequency values;
- candidate CSV and manifest selected-count agreement;
- exact candidate-row identity and order;
- source-rank limit;
- deterministic selection digest;
- candidate and manifest checksums used for lineage.

The loader supports both the historical v1 manifest and report-mode v2 manifest. New generation entrypoints require the manifest explicitly.

Dynamic rank buckets are derived from the source-rank limit. Sparse accepted rows such as ranks `1`, `6`, and `10000` remain in the correct source buckets and are never collapsed to `1..3`.

## Generic forward pipeline

### 1. Candidate eligibility

```bash
npm run lexicon:naer-top-10000-audit
```

This writes:

1. accepted candidate CSV;
2. candidate manifest;
3. eligibility report.

The official workbook remains local. Generated large artifacts become authoritative only after review and an explicit repository decision.

### 2. Reading generation

```bash
npm run lexicon:reading-generation -- \
  --candidates <candidates.csv> \
  --candidate-manifest <manifest.json> \
  --concised-archive <concised.zip> \
  --concised-output <concised.json> \
  --revised-archive <revised.zip> \
  --revised-output <revised.json> \
  --cedict-dictionary <cedict-file-or-zip> \
  --cedict-expected-sha256 <sha256> \
  --cedict-source-version <version> \
  --cedict-output <cedict.json> \
  --coverage-output <reading-coverage.json>
```

The orchestrator uses the existing source-locked MOE Concised, MOE Revised, and CC-CEDICT adapters, but the candidate set, outputs, count, ranks, and lineage are generation inputs. It preserves the authority order:

1. MOE Concised exact unique reading;
2. MOE Revised exact unique fallback;
3. unique CC-CEDICT fallback;
4. explicit review for ambiguity or no match.

It never chooses automatically among heteronyms or ambiguous CC-CEDICT records.

`summarize-naer-reading-coverage.py` also accepts `--candidate-manifest` directly. Reading coverage partitions the complete eligible candidate set and produces source-rank-aware buckets.

### 3. UD syntax evidence

```bash
npm run grammar:ud-evidence-generation -- \
  --candidates <candidates.csv> \
  --candidate-manifest <manifest.json> \
  --source-dir <ud-directory> \
  --evidence-output <syntax-evidence.json> \
  --coverage-output <syntax-coverage.json>
```

The generation entrypoint derives candidate count, candidate checksum, source ranks, and rank buckets from the manifest. It retains the source-locked UD Chinese GSD file checks and the syntax-only evidence boundary.

The historical top-1,000 projector remains available to replay its committed v1/v2 artifacts. It is not the forward scaling API.

### 4. Activation generation

```bash
npm run lexicon:activation-generation -- \
  --candidates <candidates.csv> \
  --candidate-manifest <manifest.json> \
  --reading-coverage <reading-coverage.json> \
  --concised-projection <concised.json> \
  --revised-projection <revised.json> \
  --cedict-projection <cedict.json> \
  --active-catalog <words.csv> \
  --ud-evidence <syntax-evidence.json> \
  --ud-coverage <syntax-coverage.json> \
  --output <activation-report.json> \
  --csv-output <activation-report.csv>
```

The activation generation report classifies every candidate as:

- `reading-review-required`;
- `already-active-exact-identity`;
- `resolved-reading-variant`;
- `resolved-new-identity`.

It records reading authority, active-catalog identity state, and optional UD coverage. It does not mutate the catalog, guess an ambiguous reading, or require current runtime grammar admission.

This preserves three separate decisions:

- **candidate eligibility**: the source-ranked text can enter the candidate set;
- **catalog activation**: exact text and reading identity is authoritative;
- **runtime admission**: a syntax profile participates in a supported construction.

A word is not rejected from the catalog merely because one current grammar profile is unrealizable.

### 5. Formal syntax generation

`build-formal-syntax-coverage.ts` no longer requires exactly 322 entries or one fixed evidence path. It accepts explicit paths for:

- words/catalog source;
- MOE Concised projection;
- MOE Revised projection;
- CC-CEDICT projection;
- manual overrides;
- provenance registry;
- UD syntax evidence;
- profile output;
- coverage output;
- optional expected catalog count;
- explicit provenance IDs.

The no-argument commands still reproduce and verify the current committed artifacts:

```bash
npm run grammar:formal-syntax-coverage
npm run grammar:formal-syntax-verify
```

A new catalog generation can use separate inputs and outputs without editing source constants.

## Historical replay boundary

The following remain deliberately snapshot-specific:

- committed top-1,000 artifact verification;
- historical activation review batches and their exact decision digests;
- historical catalog mutation reports;
- exact old checksums used to prove replay.

These are records of past decisions, not APIs for new vocabulary generations. Removing their constants would weaken historical reproducibility rather than improve scalability.

Future expansion must use the generic candidate, reading, UD, activation-generation, and formal-syntax entrypoints. New batch scripts must not copy old expected counts or digests.

## Remaining operational blockers

The code path is now parameterized, but the repository still does not contain the local official sources needed to execute a real top-10,000 generation. The next run must measure rather than assume:

- eligible and excluded Top-10,000 counts;
- MOE/CEDICT automatic reading coverage;
- ambiguity and unmatched review volume;
- UD observed/unseen coverage and profile distribution;
- generated artifact sizes and Git reviewability;
- source-adapter and formal-coverage runtime;
- compiled catalog and browser bundle size;
- candidate sampling latency and memory.

A separate reviewed apply step is still required before resolved identities mutate `data/source/words.sample.csv`. The activation-generation report is intentionally non-mutating so a large source run cannot silently activate thousands of entries.

## Recommended continuation

1. Run the Top-10,000 candidate audit against the pinned local workbook.
2. Run the manifest-linked reading and UD generations.
3. Review the activation-generation report and reading ambiguity queue.
4. Approve a bounded source-rank band for catalog mutation.
5. Regenerate formal syntax profiles and inspect repeated unrealizable profile clusters.
6. Measure product and CI scale before changing the browser default catalog.

Grammar changes should follow repeated profile evidence, not one exceptional token such as `不少/NUM/object`.
