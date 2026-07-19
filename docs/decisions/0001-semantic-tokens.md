# ADR 0001: Separate semantic tokens from physical keys

- Status: Accepted
- Date: 2026-07-19

## Context

A Chinese context prompt, its Bopomofo reading, and the physical keys used by one layout are distinct. Collapsing readings into `KeyboardEvent.code` sequences would bind the catalog to one physical layout and make alternate Bopomofo layouts expensive to support.

## Decision

Catalog entries store semantic token IDs only. Physical input is interpreted through an `InputLayout` that maps physical codes to tokens.

First tone is represented explicitly as `tone:1`, even though Taiwan Standard Bopomofo maps it to `Space`.

This separation does not imply that motor statistics are shared across layouts. V1 skill measurements are scoped by practice mode, layout ID, and token ID as specified by ADR 0005.

## Consequences

Positive:

- catalog readings are reusable across compatible Bopomofo layouts;
- the same semantic exercise can be rendered and tested independently from browser key events;
- alternate layouts require a new mapping rather than rewritten vocabulary data;
- measurement policy can remain layout-scoped without contaminating catalog identity.

Costs:

- an extra normalization step is required;
- UI code must display semantic tokens while listening to physical input;
- observations must retain both semantic-token and physical-layout context.