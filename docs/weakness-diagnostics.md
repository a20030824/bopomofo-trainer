# Weakness diagnostics

## Product boundary

The information drawer contains one collapsible `弱點診斷` section with three views:

- `按鍵`: expected-token correctness observations and accepted timing for one binding;
- `轉換`: exact ordered timing between adjacent tokens inside one syllable;
- `誤按`: directional expected-token to actual-token confusions.

Version 1 is a precise list-based diagnostic. It does not calculate a combined weakness score and does not include the later keyboard relationship graph.

## Separate metrics

Correctness and timing remain separate observations. The interface may show an overall conservative data state, but it never combines them into a mastery or weakness score.

The key correctness label is `錯誤觀察比例`:

```text
mapped incorrect observations / mapped correct and incorrect observations
```

A correct recovery input after an error is another mapped observation. Therefore this ratio is not a first-attempt error rate, and the interface states that limitation explicitly.

The key timing label is `有效鍵間時間`. It is the current exponential moving average of Phase 3 accepted timing observations, not a validated ability score. Syllable starts, incorrect input, recovery input, and interaction-noise-contaminated intervals remain excluded.

A binding without enough catalog positions that can produce accepted motor timing is marked `目前不適用`, rather than being shown permanently as if more samples alone would make timing available.

## Data-state policy

Display thresholds are centralized in `src/diagnostics/policy.ts`:

| Metric | Preliminary | Sufficient |
| --- | ---: | ---: |
| Error observations | 3 attempts | 8 attempts |
| Binding timing | 3 accepted samples | 5 accepted samples |
| Transition/confusion relation | 3 observations | 5 observations |

Below the preliminary threshold, the state is `資料不足`. These are product display gates, not statistical confidence intervals.

When an overall key state is required, the interface uses the more conservative of error and timing states. Expanded key details expose the two states separately.

## Directional relationships

Transitions retain exact order:

```text
ㄓ → ㄨ  !=  ㄨ → ㄓ
```

They are created only from clean correct adjacent tokens inside one syllable. They never cross syllable, entry, or utterance boundaries.

Confusions also retain exact direction:

```text
expected ㄢ, actual ㄤ  !=  expected ㄤ, actual ㄢ
```

The displayed share is:

```text
pair occurrences / all confusion occurrences for the same expected token
```

Measurement policy `phase-3-v2` gives confusion its own observation contexts. Mapped incorrect syllable-start, within-syllable, and tone inputs contribute to confusion, while motor timing remains narrower.

## Presentation model

Browser UI code does not read measurement aggregates directly. `src/diagnostics/build-model.ts` joins:

- cumulative measurement aggregates;
- the standard physical-key layout;
- catalog support;
- curriculum state used only to explain practice scheduling.

`src/diagnostics/selectors.ts` owns deterministic sorting, Top 5 limits, selected-key direction filters, sample gates, and tone inclusion. The list implementation and a future relationship graph must consume the same selectors.

## Persistence

The measurement-contract change rotates product progress to schema 4 and Pilot history to schema 3. Older generations are deleted rather than partially migrated, so aggregates with different confusion semantics are never mixed.

Diagnostic UI preferences use the independent key:

```text
bopomofo-trainer.diagnostics.v1
```

The browser may retain panel expansion, active tab, ordering, direction filters, minimum samples, and tone inclusion. Selected keys, expanded records, hover state, and selected relationships are intentionally session-only.

## Non-goals

Version 1 does not provide:

- a combined weakness or mastery score;
- first-attempt error rate;
- statistical confidence intervals;
- cross-user comparison;
- ergonomic causal inference;
- mobile-specific interaction design;
- transition or confusion flight-line visualization.
