# Weakness diagnostics

## Product boundary

Weakness diagnostics use two presentation levels.

### Information drawer

The existing 440px information drawer remains a lightweight status and settings surface. Its weakness-diagnostic section contains only:

- the objective aggregate summary;
- one representative key signal;
- one representative transition signal;
- one representative confusion signal;
- one `展開分析` action.

The drawer does not contain diagnostic tabs, complete lists, expanded records, a miniature relationship graph, or dense filter controls. Increasing typography or row density inside the drawer is not an acceptable substitute for a proper analysis layout.

### Analysis mode

`展開分析` opens a full-viewport analysis mode inside the current application. It is not a separate route and does not reload or replace the active practice session.

Analysis mode contains three views:

- `按鍵`: expected-token correctness observations and accepted inter-key timing for one binding;
- `轉換`: exact ordered timing between adjacent tokens inside one syllable;
- `誤按`: directional expected-token to actual-token confusions.

The mode is a complete diagnostic workspace, not only a flight-line visualization. It combines spatial keyboard reading, exact lists, filters, sample-state explanations, and selected-item details.

## Design principles

1. Preserve the product's quiet typographic and spatial rhythm. Do not solve analytical density by globally enlarging controls or introducing dashboard-style cards.
2. Keep the drawer scannable. It answers whether there is anything worth opening, not every diagnostic question.
3. Give exact values and spatial relationships separate areas. The keyboard explains where; the inspector explains how much and why.
4. Use the existing keyboard sketch as product identity. Analysis mode shares its geometry, perspective, key shape, border language, and theme tokens.
5. Preserve metric distinctions. Correctness, binding timing, transition timing, and confusion counts are not merged into one score.
6. Keep graph and list semantics identical. Any spatial overlay must consume the same selector output as the exact list.
7. Keep practice state in place. Entering analysis pauses input but does not complete, reset, or mutate the current round.

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

- objective counts: keys with observations, repeated confusions, slower sufficient-sample transitions;
- one short explanation of the active metric;
- the data-state legend: `資料不足 / 初步 / 資料足夠`;
- the current selected-key and direction scope when applicable;
- the limitation note for `錯誤觀察比例` on the key tab.

It does not duplicate every exact row displayed in the inspector.

## Keyboard canvas

The keyboard canvas reuses the standard physical layout and the existing sketch language.

### Shared geometry

`src/app/keyboard-geometry.ts` owns the full keyboard row geometry, physical codes, and key-unit spans. Both the practice sketch and analysis keyboard must consume this module after the geometry extraction is complete.

### Key view

The key view emphasizes the exact keys returned by the active key selector.

- error sorting may display error-observation ratios on emphasized keys;
- timing sorting may display accepted inter-key time on emphasized keys;
- selecting a key synchronizes the inspector detail;
- keys without observations remain visually available but subdued;
- rank or metric intensity may change emphasis, but does not imply a combined weakness score.

### Transition view

The transition view emphasizes endpoints from the exact currently filtered transition rows.

Before flight lines are implemented, the first analysis-mode milestone may show:

- selected key;
- connected endpoint keys;
- direction and sample scope;
- exact rows in the inspector.

The later SVG layer adds directional flight lines without changing selectors or list results.

### Confusion view

The confusion view follows the same rule:

- selected expected/actual key scope;
- endpoints from exact currently filtered confusion rows;
- later directional SVG overlays;
- no visual merging of opposite confusion directions.

### Flight-line layer

Flight lines are a later milestone inside the analysis mode, not the reason for the mode to exist.

Requirements:

- SVG rather than Canvas;
- fixed routing lanes;
- deterministic paths;
- stable width scale;
- explicit arrow direction;
- tone routing separated from dense central relations;
- hover, click, keyboard focus, and list synchronization;
- transitions and confusions never share one simultaneous network view.

## Inspector rail

The inspector rail is the exact-reading surface.

It contains, from top to bottom:

1. active filters;
2. Top 5 / complete-list scope;
3. exact rows;
4. one persistent selected-item detail pane.

Rows no longer expand into long inline blocks. Selecting a row updates the detail pane, preserving list position and comparison context.

### Key inspector

The key list supports:

- sort by `錯誤觀察比例`;
- sort by `有效鍵間時間`;
- Top 5 / complete list;
- selected-key synchronization with the keyboard.

The detail pane shows:

- attempts and errors;
- error-data state;
- accepted timing, best timing, and timing-data state;
- all four timing exclusion counters;
- current frequency-first expected-token influence and reason.

### Transition inspector

The transition list supports:

- selected key;
- incoming / outgoing / both;
- minimum accepted samples;
- include tones;
- Top 5 / complete list.

The detail pane shows exact direction, current and best accepted timing, sample count, and data state.

### Confusion inspector

The confusion list supports:

- selected key;
- expected / actual / both;
- Top 5 / complete list.

The detail pane shows exact expected and actual keys, occurrences, expected-token confusion total, expected-error share, and data state.

## Drawer summary contract

The drawer summary uses the same model and selectors as analysis mode.

It may display:

- objective aggregate text such as `24 個按鍵已有資料 · 2 組重複誤按 · 8 組較慢轉換`;
- the first error-sorted key row with its ratio and sample count;
- the first sufficient-sample transition row with timing;
- the first confusion row with occurrences;
- `展開分析`.

It must not introduce subjective counts such as `3 個值得注意的按鍵` unless a future formal attention policy defines that set.

## Separate metrics

Correctness and timing remain separate observations. The interface may show an overall conservative data state, but it never combines them into a mastery or weakness score.

The key correctness label is `錯誤觀察比例`:

```text
mapped incorrect observations / mapped correct and incorrect observations
```

A correct recovery input after an error is another mapped observation. Therefore this ratio is not a first-attempt error rate, and the interface states that limitation explicitly.

The key timing label is `有效鍵間時間`. It is the current exponential moving average of accepted timing observations, not a validated ability score. Syllable starts, incorrect input, recovery input, and interaction-noise-contaminated intervals remain excluded.

A binding with no catalog position that can produce accepted motor timing is marked `目前不適用`, rather than being shown permanently as if more samples alone would make timing available.

## Data-state policy

Display thresholds are centralized in `src/diagnostics/policy.ts`:

| Metric | Preliminary | Sufficient |
| --- | ---: | ---: |
| Error observations | 3 attempts | 8 attempts |
| Binding timing | 3 accepted samples | 5 accepted samples |
| Transition/confusion relation | 3 observations | 5 observations |

Below the preliminary threshold, the state is `資料不足`. These are product display gates, not statistical confidence intervals.

When an overall key state is required, the interface uses the more conservative of error and timing states. The selected-key detail exposes the two states separately.

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

`src/diagnostics/selectors.ts` owns deterministic sorting, Top 5 limits, selected-key direction filters, sample gates, and tone inclusion. Drawer signals, inspector lists, keyboard emphasis, and future flight lines consume these same selectors.

## Persistence

The measurement-contract change rotates product progress to schema 4 and Pilot history to schema 3. Older generations are deleted rather than partially migrated, so aggregates with different confusion semantics are never mixed.

Diagnostic UI preferences use the independent key:

```text
bopomofo-trainer.diagnostics.v1
```

The browser may retain active tab, ordering, direction filters, minimum samples, and tone inclusion. Selected keys, selected relationships, list scope, hover state, and detail selection are session-only.

The previously implemented drawer-expansion preference is retained only until the analysis-mode preference cleanup; the final drawer summary is not collapsible.

## Engineering plan

### Milestone 1 — analysis shell and drawer summary

Owned paths:

```text
src/app/diagnostic-enhancement.ts
src/app/diagnostic-panel.ts
src/app/diagnostics.css
src/app/keyboard-geometry.ts
src/app/browser.ts
```

Deliverables:

- replace the full drawer diagnostic with the compact summary contract;
- create a full-viewport in-app analysis shell;
- add overview, keyboard canvas, and inspector regions;
- move existing list controls and details into the inspector;
- use one persistent detail pane rather than expanding rows;
- pause background interaction through `inert` and focus containment;
- implement entry/exit and reduced-motion behavior;
- keep selectors and diagnostic model unchanged.

Acceptance:

- the drawer remains readable at 440px without dense analytical controls;
- analysis opens without route navigation or practice reset;
- closing returns directly to the same practice round;
- exact list/filter behavior matches the current selector tests;
- keyboard emphasis and list rows use the same selected output.

### Milestone 2 — shared practice keyboard renderer

Owned paths:

```text
src/app/main.ts
src/app/keyboard-geometry.ts
src/app/style.css
src/app/diagnostics.css
```

Deliverables:

- remove the private keyboard geometry from `main.ts`;
- render both practice and analysis keyboards from shared geometry;
- preserve the existing practice-keyboard appearance and behavior;
- add analysis-only labels, selection, and metric overlays without altering practice markup semantics.

Acceptance:

- one geometry source defines every physical row and key width;
- practice screenshot remains visually equivalent;
- analysis keyboard follows the same perspective and key-shape language.

### Milestone 3 — analysis layout visual review

Deliverables:

- generate desktop light and dark screenshots with deterministic fixture data;
- review hierarchy, list/detail balance, keyboard size, empty states, and scroll ownership;
- adjust layout only within the established typography and spacing language;
- do not enlarge the global design system to solve local density.

Acceptance:

- the keyboard remains the central visual anchor;
- exact values remain readable without turning the interface into a conventional dashboard;
- no long inline row expansion remains;
- drawer summary and full analysis have clearly different information depth.

### Milestone 4 — transition SVG relationships

Deliverables:

- add deterministic transition routing;
- support selected-key and complete-network modes;
- synchronize hover/focus/selection with the inspector;
- preserve current transition selector output exactly.

### Milestone 5 — confusion SVG relationships

Deliverables:

- add a separate directional confusion overlay;
- preserve expected and actual direction;
- synchronize with the same confusion selector and inspector.

## Validation

Every milestone runs:

```text
npm run typecheck
npm run test:fast
npm run test:source-adapters
npm run catalog:validate
npm run build
```

Additional UI-focused coverage should lock:

- drawer summary signal selection;
- analysis open/close state;
- persisted tab and filters;
- session-only selected key and relationship;
- keyboard/list selector identity;
- Escape and reduced-motion behavior where testable without browser automation.

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
