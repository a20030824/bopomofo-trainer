# ADR 0005: Motor skill statistics are scoped by practice mode and layout

## Status

Accepted

## Context

A semantic token such as `zhuyin:ㄥ` can be mapped to different physical positions by different Bopomofo layouts. Fluency learned on one layout does not automatically transfer to another. Recall-mode timing also includes pronunciation retrieval that guided-mode timing deliberately excludes.

A bare token ID is therefore too broad to identify the measured V1 skill.

## Decision

The primary V1 skill identity is:

```text
practice mode + layout ID + token ID
```

Transition and confusion identities are also scoped by practice mode and layout.

Catalog readings remain layout-independent. Physical key codes remain in layouts and observations, not in catalog entries.

## Consequences

- Changing layouts starts a separate motor profile rather than silently reusing token confidence.
- Guided and recall data remain separate.
- A future higher-level semantic recognition model may aggregate across layouts, but it is not part of V1.
- Skill-key serialization must be centralized and tested to avoid inconsistent map keys.
