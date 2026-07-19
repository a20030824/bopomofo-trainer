# ADR 0003: Start local-first without a backend

- Status: Accepted
- Date: 2026-07-19

## Context

The first product needs small learner profiles and session summaries. Accounts, synchronization, and social features are not required to validate the training method.

## Decision

The initial architecture has no server dependency. Persistence is represented by a small interface and begins with an in-memory implementation for simulations.

A browser prototype may use local storage. IndexedDB is introduced only if the product retains raw observations, large session histories, multiple catalogs, or recomputable metrics.

## Consequences

Positive:

- no deployment, authentication, privacy, or database burden;
- the prototype works offline;
- progress remains private by default;
- storage technology can follow actual data requirements.

Costs:

- progress does not initially synchronize across devices;
- browser data can be lost unless export/import is later added;
- future accounts require a deliberate migration design.
