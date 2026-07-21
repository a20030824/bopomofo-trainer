# NAER 1141208 active-catalog commonness projection

Issue #44 already pinned the official workbook structure. This document records the smaller Issue #45 product boundary; it does not repeat workbook inspection or publish the full lexical table.

## Local source adapter

Run the source-specific adapter with the official workbook kept outside the repository:

```powershell
npm run commonness:naer -- --workbook "通用詞頻表 - 定稿1141208.xlsx"
```

The adapter:

- computes and verifies SHA-256 `bfd3b73938e115ae39a44c5e11c97135c09939cf598157cb2fe0b33c4302de75`;
- requires the single sheet `通用詞頻表`, dimension `A1:L163702`, and all twelve exact headers;
- reads A as the version-local rank, B as `NFC(trim(text))`, D as written-per-million, and G as spoken-per-million;
- preserves numeric `0` separately from a missing cell;
- retains J and L only as declared ignored diagnostics, never as `commonness-v1` inputs;
- emits only rows whose normalized text occurs in the active catalog.

The official XLSX and the remaining non-catalog lexical rows stay local and are never written to the repository.

## Exact identity boundary

A source row becomes reviewed evidence only when its normalized lexical text maps to exactly one catalog identity. A text shared by multiple readings is reported as `ambiguous_text`; a source text with no catalog identity is reported as `unmatched_text`. No pronunciation, POS, valency, grammar role, heteronym split, or variant decision is inferred from NAER.

The committed active-catalog artifact is deliberately small and versioned. It is regenerated locally from the pinned workbook and current catalog; the browser never opens the XLSX and has no network, backend, cloud, or runtime-model dependency.

## Current catalog result

For the current 49-entry catalog:

- reviewed exact matches: `49`;
- ambiguous identities: `0`;
- unmatched catalog identities: `0`;
- omitted non-catalog NAER rows: `163,652`;
- `commonness-v1` determinism digest: `65cd94c9dc0b927a4fa1e08edeeb85fad0293e5821146b950beb0adfd5c44b2f`.

Normalization and scoring remain unchanged from `commonness-v1`: accepted evidence supplies the spoken and written maxima, channels use log strength, spoken/written weights remain 0.60/0.40, and selection weight remains in `[0.05, 1]`.

## Product integration

`npm run app:catalog` compiles the reviewed lexical/grammar catalog, projects the committed active NAER rows through the source-neutral commonness core, applies `CatalogEntry.commonnessBase`, then performs the existing deterministic practice/evaluation partition.

The frequency-first utterance selector uses:

```text
entry.commonnessBase?.selectionWeight
?? frequencyBandWeights[entry.frequencyBand]
```

The base for a complete grammar-valid utterance remains the geometric mean of its entry weights. `frequencyBand` still controls stage eligibility; expected-token and exact within-syllable transition evidence remain bounded learner boosts; confusion diagnostics remain disconnected from curriculum scoring.

## Redistribution boundary

The repository contains neither the official workbook nor the 163,701-row table. The small active-catalog artifact contains only the evidence necessary for the reviewed catalog identities and retains source/version/checksum provenance. Redistribution permission for the official bulk source remains a separate review concern and is not implied by this projection.
