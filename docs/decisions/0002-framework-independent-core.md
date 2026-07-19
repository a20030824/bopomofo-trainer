# ADR 0002: Keep the training core framework-independent

- Status: Accepted
- Date: 2026-07-19

## Context

The project has not yet validated its curriculum, metrics, or interaction model. Choosing a UI framework is lower risk than coupling learning logic to components, DOM events, or browser storage.

## Decision

The initial core is plain TypeScript. Curriculum selection, session progression, catalog compilation, and metrics must be callable without React, a browser, or persistent storage.

The first executable artifact will be a Node-based curriculum simulator. A web framework will be selected only when a real interface is implemented.

## Consequences

Positive:

- curriculum experiments run quickly and deterministically;
- tests do not require a browser;
- UI technology can change without rewriting learning logic;
- the project stays lightweight during concept validation.

Costs:

- adapters are needed for time, randomness, input events, and persistence;
- some types may initially feel more abstract than direct component state;
- UI convenience libraries cannot define the domain model.
