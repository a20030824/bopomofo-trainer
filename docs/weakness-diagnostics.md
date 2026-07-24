# Weakness diagnostics

## Product boundary

Weakness diagnostics use two presentation levels.

### Information drawer

The existing 440px information drawer remains a lightweight status and settings surface. Its weakness-diagnostic section contains only:

- the objective aggregate summary;
- one representative key signal;
- one representative transition signal;
- one representative confusion signal;
- one `進入分析` action.

The drawer does not contain diagnostic tabs, complete lists, expanded records, a miniature relationship graph, or dense filter controls. Increasing typography or row density inside the drawer is not an acceptable substitute for a proper analysis layout.

### Analysis mode

`進入分析` opens a full-viewport analysis mode inside the current application. It is not a separate route and does not reload or replace the active practice session.

Analysis mode contains three views:

- `按鍵`: expected-token correctness observations and accepted inter-key timing for one binding;
- `轉換`: exact ordered timing between adjacent tokens inside one syllable;
- `誤按`: directional expected-token to actual-token confusions.

The mode combines spatial keyboard reading, exact lists, filters, sample warnings, selected-item details, and separate directional SVG relationships for transitions and confusions.

## Design principles

1. Preserve the product's quiet typographic and spatial rhythm. Do not solve analytical density by globally enlarging controls or introducing dashboard-style cards.
2. Keep the drawer scannable. It answers whether there is anything worth opening, not every diagnostic question.
3. Give exact values and spatial relationships separate areas. The keyboard explains where; the inspector explains how much and why.
4. Use the existing keyboard sketch as product identity. Analysis mode shares its geometry, perspective, key shape, border language, and theme tokens.
5. Preserve metric distinctions. Correctness, binding timing, transition timing, and confusion counts are not merged into one score.
6. Keep graph and list semantics identical. Spatial overlays use the exact currently rendered selector result from the inspector.
7. Keep practice state in place. Entering analysis pauses input but does not complete, reset, or mutate the current round.
8. Reserve red for actual input errors. Diagnostic selection, focus, graph lines, and sample warnings use neutral ink emphasis.
9. Treat sufficient data as the normal state. Only `資料不足` and `初步` require visible warning labels.

## Entry and transition

Opening analysis performs one coordinated transition:

1. the information drawer translates out to the right;
2. the practice surface recedes without being destroyed;
3. a keyboard using the shared sketch geometry rises from the lower practice position into the analysis canvas;
4. the overview and inspector enter after the keyboard establishes continuity.

Closing analysis reverses the transition and returns directly to practice. The information drawer does not reopen automatically.

The transition is decorative. With `prefers-reduced-motion: reduce`, the layout changes without translation or scale animation.

While analysis mode is open:

- ordinary practice input is paused;
- background application content is inert;
- focus remains within analysis controls;
- `Escape` closes analysis;
- the current round and unsent input state remain unchanged.

## Desktop layout

Analysis mode uses a full-viewport shell with a persistent header and three content regions.

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 弱點診斷   [按鍵] [轉換] [誤按]                         返回練習 │
├───────────────────────────────────────────────────────────────────────┤
│ overview rail │       keyboard analysis canvas       │ inspector rail │
│               │                                      │                │
│ summary       │ shared keyboard geometry             │ filters        │
│ metric guide  │ key emphasis / relation overlays     │ exact list     │
│ active scope  │ selected item context                 │ selected detail│
└───────────────────────────────────────────────────────────────────────┘
```

Recommended desktop proportions:

- overview rail: `190–230px`;
- keyboard canvas: flexible, never below the width required for readable key geometry;
- inspector rail: `340–400px`;
- overall content width: bounded by the existing product shell rhythm rather than edge-to-edge dashboard spacing.

The first implementation may collapse the overview rail above the canvas at intermediate desktop widths. Mobile-specific interaction remains outside this workstream.

## Header

The analysis header contains:

- `弱點診斷` title;
- the objective summary in a secondary line;
- `按鍵 / 轉換 / 誤按` tabs;
- `返回練習` as the primary exit action.

Tabs use the WAI-ARIA tab pattern:

- `role="tablist"`;
- `role="tab"`;
- `role="tabpanel"`;
- roving `tabindex`;
- Left/Right, Home, and End keyboard navigation.

The active tab is persisted. Selected keys and selected relationships remain session-only.

## Overview rail

The overview rail gives context, not another list.

It contains:

- objective counts: keys with observations, repeated confusions, and slower sufficient-sample transitions;
- one short explanation of the active metric;
- warnings only for `資料不足` and `初步`;
- the current selected-key and direction scope when applicable;
- the limitation note for `錯誤觀察比例` on the key tab.

`資料足夠` remains an internal display state but is not shown as a badge or legend item. Sufficient data is the unmarked normal state.

## Keyboard canvas

The keyboard canvas reuses the standard physical layout and the existing sketch language.

### Shared geometry

`src/app/keyboard-geometry.ts` owns the full keyboard row geometry, physical codes, and key-unit spans. Both the practice sketch and analysis keyboard must consume this module after the geometry extraction is complete.

The analysis keyboard displays only Bopomofo or tone symbols. Physical English labels remain available to assistive technology and in the exact inspector, but do not compete with the central keyboard reading.

The standard number row is fixed by the layout contract and test coverage:

```text
1 ㄅ · 2 ㄉ · 3 ˇ · 4 ˋ · 5 ㄓ · 6 ˊ · 7 ˙ · 8 ㄚ · 9 ㄞ · 0 ㄢ · - ㄦ
```

### Key view

The key view emphasizes the exact keys returned by the active key selector.

- error sorting may display error-observation ratios on emphasized keys;
- timing sorting may display accepted inter-key time on emphasized keys;
- selecting a key synchronizes the inspector detail;
- keys without observations remain visually available but subdued;
- rank or metric intensity may change emphasis, but does not imply a combined weakness score.

### Transition view

The transition view displays endpoints and directional SVG paths from the exact currently filtered transition rows.

- selected key, direction, sample gate, tone setting, and list scope all affect both list and graph;
- opposite directions remain separate paths;
- selecting a path selects the corresponding inspector row;
- hover and focus synchronize between path and row.

### Confusion view

The confusion view uses a separate directional SVG overlay.

- expected and actual direction remain explicit;
- opposite directions remain separate records and paths;
- transition and confusion networks are never shown simultaneously;
- path and inspector selection remain synchronized.

### Relationship routing

Relationship paths use:

- SVG rather than Canvas;
- deterministic cubic paths derived from shared keyboard geometry;
- stable sample-count width tiers;
- explicit arrow direction;
- separate higher, dashed routing for tone relations;
- hover, click, keyboard focus, and list synchronization;
- neutral ink styling rather than error red.

The current browser adapter builds the overlay from the exact visible inspector rows after selectors have applied direction, sample, tone, and first-five/full-list filters. Direct model composition remains a cleanup milestone.

## Inspector rail

The inspector rail is the exact-reading surface.

It contains, from top to bottom:

1. active filters;
2. first-five / complete-list scope;
3. exact rows;
4. one persistent selected-item detail pane.

Rows do not expand into long inline blocks. Selecting a row updates the detail pane, preserving list position and comparison context.

### Key inspector

The key list supports:

- sort by `錯誤觀察比例`;
- sort by `有效鍵間時間`;
- first five / complete list;
- selected-key synchronization with the keyboard.

The detail pane shows:

- attempts and errors;
- visible warnings only when error or timing data is insufficient or preliminary;
- accepted timing and best timing;
- all four timing exclusion counters;
- current frequency-first expected-token influence and reason.

### Transition inspector

The transition list supports:

- selected key;
- incoming / outgoing / all directions;
- minimum accepted samples;
- include tones;
- first five / complete list.

The detail pane shows exact direction, current and best accepted timing, sample count, and any non-sufficient sample warning.

### Confusion inspector

The confusion list supports:

- selected key;
- expected / actual / all directions;
- first five / complete list.

The detail pane shows exact expected and actual keys, occurrences, expected-token confusion total, expected-error share, and any non-sufficient sample warning.

## Drawer summary contract

The drawer summary uses the same model and selectors as analysis mode.

It may display:

- objective aggregate text such as `24 鍵有資料 · 2 組重複誤按 · 8 組慢轉換`;
- the first error-sorted key row with its ratio and sample count;
- the first sufficient-sample transition row with timing;
- the first confusion row with occurrences;
- `進入分析`.

It must not introduce subjective counts such as `3 個值得注意的按鍵` unless a future formal attention policy defines that set.

## Separate metrics

Correctness and timing remain separate observations. The interface may use an overall conservative data state to decide whether a warning is needed, but it never combines metrics into a mastery or weakness score.

The key correctness label is `錯誤觀察比例`:

```text
mapped incorrect observations / mapped correct and incorrect observations
```

A correct recovery input after an error is another mapped observation. Therefore this ratio is not a first-attempt error rate, and the interface states that limitation explicitly.

The key timing label is `有效鍵間時間`. It is the current exponential moving average of accepted timing observations, not a validated ability score. Syllable starts, incorrect input, recovery input, and interaction-noise-contaminated intervals remain excluded.

A binding with no catalog position that can produce accepted motor timing is marked `不適用`, rather than being shown permanently as if more samples alone would make timing available.

## Data-state policy

Display thresholds are centralized in `src/diagnostics/policy.ts`:

| Metric | Preliminary | Sufficient |
| --- | ---: | ---: |
| Error observations | 3 attempts | 8 attempts |
| Binding timing | 3 accepted samples | 5 accepted samples |
| Transition/confusion relation | 3 observations | 5 observations |

Below the preliminary threshold, the state is `資料不足`. Between thresholds it is `初步`. Both receive visible warnings. Sufficient rows are unmarked.

These are product display gates, not statistical confidence intervals.

## Selection influence

The selected-key detail explains the browser's actual frequency-first selection influence, not the older single-focus curriculum state.

For one expected token, the diagnostic applies the same public policy inputs used by production selection:

- `minimumBindingAttempts` gates the error contribution;
- `minimumBindingTimingSamples` gates the timing contribution;
- current timing is compared with that token's own best accepted timing;
- current error and timing influence settings scale their respective contributions;
- the result is capped by `maximumExpectedTokenBoost`.

The user-facing states are:

- `尚未達選題門檻`;
- `目前無額外加權`;
- `選題加權中`.

This is an explainable selection modifier, not a claim that the key is being trained at a guaranteed rate. Candidate frequency, grammar compatibility, other learner evidence, recent-use penalties, and the combined learner cap still affect final utterance selection.

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
- catalog support used to distinguish available and non-applicable timing;
- the current frequency-first selection policy, including user-selected influence scales.

`src/diagnostics/selectors.ts` owns deterministic sorting, first-five limits, selected-key direction filters, sample gates, and tone inclusion. Drawer signals, inspector lists, and keyboard emphasis consume these selectors. The temporary relationship enhancement consumes the exact rendered inspector result so graph and list cannot diverge in visible scope.

## Persistence

The measurement-contract change rotates product progress to schema 4 and Pilot history to schema 3. Older generations are deleted rather than partially migrated, so aggregates with different confusion semantics are never mixed.

Diagnostic UI preferences use the independent key:

```text
bopomofo-trainer.diagnostics.v1
```

The browser may retain active tab, ordering, direction filters, minimum samples, and tone inclusion. Selected keys, selected relationships, list scope, hover state, and detail selection are session-only.

The previously implemented drawer-expansion preference is retained only until the analysis-mode preference cleanup; the final drawer summary is not collapsible.

## Engineering status

### Completed in this Draft PR

- compact drawer summary;
- full-viewport analysis shell;
- overview, keyboard canvas, inspector, and persistent detail pane;
- neutral diagnostic emphasis with red reserved for input errors;
- warning-only sample labels;
- Bopomofo-only keyboard display with exact number-row tests;
- deterministic transition and confusion SVG routing;
- graph/list hover, focus, click, and selection synchronization;
- tone-specific relationship routing;
- reduced-motion and keyboard tab navigation;
- measurement-generation rotation for expanded confusion contexts.

### Remaining cleanup

- remove the private keyboard geometry copy from `main.ts` and render practice from `src/app/keyboard-geometry.ts`;
- replace temporary localStorage/model reconstruction with direct live-state composition;
- replace the DOM relationship adapter with direct selector-result input when the analysis shell is integrated into `main.ts`;
- add browser-level interaction screenshots or tests when the repository adopts a browser test harness.

## Validation

Every milestone runs:

```text
npm run typecheck
npm run test:fast
npm run test:source-adapters
npm run catalog:validate
npm run build
```

Additional coverage locks:

- measurement semantics and generation rejection;
- diagnostic model and deterministic selectors;
- preference validation;
- shared keyboard row geometry and number-row labels;
- exact keyboard relationship coordinates;
- deterministic directional routing, reverse-direction separation, selection, and tone marking.

## Non-goals

This workstream does not provide:

- a combined weakness or mastery score;
- first-attempt error rate;
- statistical confidence intervals;
- cross-user comparison;
- ergonomic causal inference;
- mobile-specific interaction design;
- route-level navigation or server persistence;
- simultaneous transition and confusion networks.
