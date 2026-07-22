# Commonness projection v1

Status: product-facing projection contract. The source-specific NAER column mapping remains gated by Issue #44.

## Purpose

The practice selector needs a continuous commonness base without importing NAER-specific workbook fields into curriculum code. `commonness-v1` converts reviewed spoken and written frequency evidence into a source-neutral `CatalogCommonnessBase`. Catalog entries without reviewed evidence continue to use their existing `frequencyBand`.

## Input boundary

Every evidence record identifies exactly one reviewed catalog entry and preserves:

- source ID and source version;
- source row identity;
- spoken frequency per million, including a true numeric zero;
- written frequency per million, including a true numeric zero;
- identity review status.

`null` means missing. `0` means an observed zero. They are never interchangeable.

The projection excludes:

- unresolved catalog identities;
- negative or non-finite frequencies;
- rows with both frequency channels missing;
- duplicate evidence for one catalog identity;
- one source row mapped to more than one catalog identity, *unless* every one
  of those identities shares the same catalog text -- that shape is a
  reviewed heteronym (several active readings for one hanzi), and the source
  row's frequency figure describes the written/spoken word regardless of
  which reading is practiced, so it is intentionally donated to every
  reading variant rather than excluded.

This still rejects the case the original rule was meant to catch: one source
row accidentally mapped to genuinely different, unrelated catalog texts.

## Normalization

For each available channel, v1 derives its maximum from the accepted reviewed identity set and applies:

```text
strength = log(1 + value) / log(1 + channel maximum)
```

When the accepted channel maximum is zero, every observed value in that channel receives strength `0`.

The model combines available channels using:

- spoken weight: `0.60`;
- written weight: `0.40`.

When only one channel is present, the available weight is renormalized rather than treating the missing channel as zero.

The raw score remains in `[0, 1]`. Selection uses:

```text
selectionWeight = 0.05 + score × 0.95
```

This keeps an observed zero selectable at a very low rate while preserving `score = 0` in the evidence record.

## Product seam

`CatalogEntry.commonnessBase` is optional. Curriculum code reads `selectionWeight` when present and otherwise falls back to the declared weight for `frequencyBand`.

The contract is source-neutral. NAER adapter types and workbook header names must remain under the reference/import boundary and must not enter curriculum modules.

## Determinism

Evidence is sorted by catalog identity and source identity before projection. Accepted entries and exclusions use canonical ordering. Output includes a SHA-256 digest of the complete projection payload before the digest field is added.

The same evidence set, model configuration, identity decisions, and source version therefore produce byte-for-byte identical serialized output.

## Deferred work

This model does not include:

- domain breadth;
- pedagogical level;
- cross-source agreement;
- automatic catalog approval;
- claims that corpus frequency alone determines teaching value.

The exact NAER source-column mapping, checksum, and reviewed structural report remain part of Issue #44. The source adapter and local projection command remain part of Issue #45.
