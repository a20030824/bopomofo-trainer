# ADR 0001: Separate semantic tokens from physical keys

- Status: Accepted
- Date: 2026-07-19

## Context

A Chinese prompt, its Bopomofo reading, and the physical keys used by one layout are distinct. Collapsing readings into `KeyboardEvent.code` sequences would bind the catalog and learner metrics to one keyboard layout.

## Decision

Training items store semantic token IDs only. Physical input is interpreted through an `InputLayout` that maps physical codes to tokens.

First tone is represented explicitly as `tone:1`, even though Taiwan Standard Bopomofo maps it to `Space`.

## Consequences

Positive:

- catalogs are reusable across compatible layouts;
- semantic token statistics remain meaningful when layouts change;
- layout-specific physical statistics can be added separately;
- tests can exercise the session engine without browser keyboard events.

Costs:

- an extra normalization step is required;
- UI code must display semantic tokens while listening to physical input;
- profile scoping across layouts needs a future explicit policy.
