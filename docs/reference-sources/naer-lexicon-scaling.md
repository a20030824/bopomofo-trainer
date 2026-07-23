# NAER lexicon generation

## Boundary

The pinned NAER workbook is an input source. Candidate, dictionary, UD, and
activation projections are reproducible work products and are not committed
as permanent repository data.

Historical top-1,000 candidate and activation-review snapshots were retired.
Past decisions remain available in Git history; the active catalog and its
current source evidence are the repository source of truth.

## One forward command

```bash
npm run lexicon:generation-pipeline
```

The command writes a self-contained, Git-ignored workspace under:

```text
data/generated/lexicon/naer-<source>-top-<limit>/
```

It contains:

- candidate CSV, manifest, and eligibility report;
- MOE Concised/Revised and CC-CEDICT projections;
- reading coverage;
- UD evidence and coverage;
- manifest-linked syntax profiles and a formal rule-reachability index
  (`syntax-profiles.json`, `syntax-rule-index.json`);
- the machine activation report;
- a compact human review CSV.

The workspace stays intact because reviewed apply tools need the CEDICT and
UD evidence, and `npm run app:syntax-legality` needs the rule index. Delete
the directory whenever the run is no longer needed; the pinned sources under
`data/external/` can reproduce it.

## Review CSV

The human-facing CSV intentionally contains only:

```text
general_rank,text,status,reading_authority,reading,
reading_review_status,ud_occurrence_count,ud_upos
```

Lineage, source evidence, checksums, and full syntax structures remain in the
machine JSON files instead of bloating the spreadsheet.

## Safety

Generation never mutates the active catalog. Catalog mutation is a separate
reviewed step and should be previewed with `--dry-run` whenever supported.

The source-ranked candidate list preserves original NAER ranks. Invalid or
duplicate lexical rows are reported and excluded without renumbering later
candidates.

## Browser catalog syntax gate

`npm run app:syntax-legality` projects the workspace's full-scope rule index
into a compact, committed allowlist at
`data/grammar/formal-syntax-active-catalog-legality.json`, scoped to the
current active catalog only. `npm run app:catalog` packages only entries
whose source rule-index status is `indexed` and fails the build if the
allowlist is stale, incomplete, or digest-mismatched against the compiled
catalog. There is no separate pinned top-N evidence snapshot to keep in
sync; the allowlist is regenerated from a fresh generation run.
