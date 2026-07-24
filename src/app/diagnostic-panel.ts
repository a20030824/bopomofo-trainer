import "./diagnostics.css";
import "./diagnostic-polish.css";
import type { TokenId } from "../core/model.js";
import {
  diagnosticDataStateLabel,
  physicalKeyLabel,
  tokenLabel,
} from "../diagnostics/labels.js";
import {
  selectConfusionDiagnostics,
  selectKeyDiagnostics,
  selectTransitionDiagnostics,
} from "../diagnostics/selectors.js";
import type {
  ConfusionDiagnostic,
  DiagnosticDataState,
  DiagnosticModel,
  KeyDiagnostic,
  TransitionDiagnostic,
} from "../diagnostics/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  DEFAULT_DIAGNOSTIC_PREFERENCES,
  loadDiagnosticPreferences,
  saveDiagnosticPreferences,
  type DiagnosticPreferenceStorage,
  type DiagnosticPreferences,
  type DiagnosticTab,
} from "./diagnostic-preferences.js";
import {
  KEYBOARD_GEOMETRY_ROWS,
  keyboardColumnSpan,
} from "./keyboard-geometry.js";

const DIAGNOSTIC_TABS = ["key", "transition", "confusion"] as const;
const MINIMUM_SAMPLE_OPTIONS = [1, 3, 5, 8] as const;
const ANALYSIS_ANIMATION_MS = 180;

interface EphemeralDiagnosticState {
  readonly selectedKey: TokenId | null;
  readonly selectedRelationId: string | null;
  readonly complete: Readonly<Record<DiagnosticTab, boolean>>;
}

interface KeyboardSignal {
  readonly badge: string | null;
  readonly strength: number;
  readonly connected: boolean;
  readonly selected: boolean;
}

export interface DiagnosticAnalysisController {
  open(initialTab?: DiagnosticTab): void;
  close(): void;
  destroy(): void;
}

export interface DiagnosticAnalysisOptions {
  readonly getModel: () => DiagnosticModel;
  readonly storage: DiagnosticPreferenceStorage;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function milliseconds(value: number): string {
  return `${Math.round(value)} ms`;
}

function boost(value: number): string {
  return `${value.toFixed(2)}×`;
}

function summaryText(model: DiagnosticModel): string {
  return `${model.summary.keysWithData} 鍵有資料 · ${model.summary.repeatedConfusions} 組重複誤按 · ${model.summary.slowerTransitions} 組慢轉換`;
}

function tabLabel(tab: DiagnosticTab): string {
  if (tab === "transition") return "轉換";
  if (tab === "confusion") return "誤按";
  return "按鍵";
}

function tabButtonId(tab: DiagnosticTab): string {
  return `diagnostic-analysis-tab-${tab}`;
}

function tabPanelId(tab: DiagnosticTab): string {
  return `diagnostic-analysis-panel-${tab}`;
}

function isDiagnosticTab(value: string | undefined): value is DiagnosticTab {
  return value === "key" || value === "transition" || value === "confusion";
}

function stateBadgeMarkup(state: DiagnosticDataState): string {
  if (state === "sufficient") return "";
  return `<span class="diagnostic-state ${state}">${escapeHtml(diagnosticDataStateLabel(state))}</span>`;
}

function detailStateMarkup(state: DiagnosticDataState): string {
  if (state === "sufficient") return "";
  return `<strong class="diagnostic-detail-state ${state}">${escapeHtml(diagnosticDataStateLabel(state))}</strong>`;
}

function keyRows(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): readonly KeyDiagnostic[] {
  return selectKeyDiagnostics(
    model.keys.filter((row) => row.attempts > 0),
    preferences.keySort,
    state.complete.key,
  );
}

function transitionRows(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): readonly TransitionDiagnostic[] {
  return selectTransitionDiagnostics(model.transitions, {
    selectedKey: state.selectedKey,
    direction: preferences.transitionDirection,
    minimumSamples: preferences.minimumSamples,
    includeTone: preferences.includeTone,
    complete: state.complete.transition,
  });
}

function confusionRows(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): readonly ConfusionDiagnostic[] {
  return selectConfusionDiagnostics(model.confusions, {
    selectedKey: state.selectedKey,
    direction: preferences.confusionDirection,
    complete: state.complete.confusion,
  });
}

function representativeSignals(model: DiagnosticModel): {
  readonly key: KeyDiagnostic | null;
  readonly transition: TransitionDiagnostic | null;
  readonly confusion: ConfusionDiagnostic | null;
} {
  return {
    key: selectKeyDiagnostics(
      model.keys.filter((row) => row.attempts > 0),
      "error-ratio",
      false,
    )[0] ?? null,
    transition: selectTransitionDiagnostics(model.transitions, {
      selectedKey: null,
      direction: "both",
      minimumSamples: 5,
      includeTone: true,
      complete: false,
    })[0] ?? null,
    confusion: selectConfusionDiagnostics(model.confusions, {
      selectedKey: null,
      direction: "both",
      complete: false,
    })[0] ?? null,
  };
}

export function renderDiagnosticSummary(
  section: HTMLElement,
  model: DiagnosticModel,
  openAnalysis: () => void,
): void {
  const signals = representativeSignals(model);
  const keyValue = signals.key === null
    ? "—"
    : `${signals.key.symbol} ${signals.key.displayedErrorRatio === null ? "—" : percent(signals.key.displayedErrorRatio)}`;
  const keyMeta = signals.key === null ? "尚無按鍵資料" : `${signals.key.attempts} 次`;
  const transitionValue = signals.transition === null
    ? "—"
    : `${signals.transition.fromSymbol} → ${signals.transition.toSymbol}`;
  const transitionMeta = signals.transition === null
    ? "轉換樣本不足"
    : `${milliseconds(signals.transition.timingMs)} · ${signals.transition.timingSamples} 樣本`;
  const confusionValue = signals.confusion === null
    ? "—"
    : `${signals.confusion.expectedSymbol} → ${signals.confusion.actualSymbol}`;
  const confusionMeta = signals.confusion === null ? "尚無誤按" : `${signals.confusion.occurrences} 次`;

  section.className = "panel-section diagnostic-summary-section";
  section.innerHTML = `<div class="diagnostic-summary-heading">
      <div>
        <h3>弱點診斷</h3>
        <p>${escapeHtml(summaryText(model))}</p>
      </div>
      <button type="button" class="diagnostic-open-analysis">進入分析</button>
    </div>
    <div class="diagnostic-summary-signals" aria-label="弱點診斷摘要">
      <div><span>按鍵</span><strong>${escapeHtml(keyValue)}</strong><small>${escapeHtml(keyMeta)}</small></div>
      <div><span>轉換</span><strong>${escapeHtml(transitionValue)}</strong><small>${escapeHtml(transitionMeta)}</small></div>
      <div><span>誤按</span><strong>${escapeHtml(confusionValue)}</strong><small>${escapeHtml(confusionMeta)}</small></div>
    </div>`;
  section.querySelector<HTMLButtonElement>(".diagnostic-open-analysis")
    ?.addEventListener("click", openAnalysis);
}

function dataLegendMarkup(): string {
  return `<div class="diagnostic-analysis-legend" aria-label="樣本提示">
    <div><span class="diagnostic-legend-mark insufficient"></span><strong>資料不足</strong><small>尚未達初步門檻</small></div>
    <div><span class="diagnostic-legend-mark preliminary"></span><strong>初步</strong><small>可讀，但樣本仍少</small></div>
  </div>`;
}

function activeScopeText(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const selected = state.selectedKey === null
    ? "全部"
    : model.keys.find((row) => row.tokenId === state.selectedKey)?.symbol ?? state.selectedKey;
  if (preferences.activeTab === "transition") {
    const direction = preferences.transitionDirection === "incoming"
      ? "進入"
      : preferences.transitionDirection === "outgoing"
        ? "離開"
        : "全部方向";
    return `${selected} · ${direction} · ≥${preferences.minimumSamples} 樣本${preferences.includeTone ? " · 聲調" : ""}`;
  }
  if (preferences.activeTab === "confusion") {
    const direction = preferences.confusionDirection === "expected"
      ? "應按"
      : preferences.confusionDirection === "actual"
        ? "按成"
        : "全部方向";
    return `${selected} · ${direction}`;
  }
  return preferences.keySort === "timing" ? "依鍵間時間" : "依錯誤比例";
}

function overviewMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const explanation = preferences.activeTab === "key"
    ? preferences.keySort === "timing"
      ? "到達各鍵的有效鍵間時間；起始、錯誤、修正與干擾不計。"
      : "已映射觀察中的錯誤比例，不是首次作答錯誤率。"
    : preferences.activeTab === "transition"
      ? "同音節相鄰鍵的方向性時間；反向另計。"
      : "應按與實際按鍵的方向性關係；反向另計。";
  return `<aside class="diagnostic-analysis-overview" aria-label="診斷摘要與說明">
    <div class="diagnostic-overview-counts">
      <div><strong>${model.summary.keysWithData}</strong><span>有資料</span></div>
      <div><strong>${model.summary.repeatedConfusions}</strong><span>重複誤按</span></div>
      <div><strong>${model.summary.slowerTransitions}</strong><span>慢轉換</span></div>
    </div>
    <section>
      <span class="diagnostic-overview-label">範圍</span>
      <p>${escapeHtml(activeScopeText(model, preferences, state))}</p>
    </section>
    <section>
      <span class="diagnostic-overview-label">指標</span>
      <p>${escapeHtml(explanation)}</p>
    </section>
    <section>
      <span class="diagnostic-overview-label">樣本提示</span>
      ${dataLegendMarkup()}
    </section>
  </aside>`;
}

function visibleRowsForTab(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): readonly (KeyDiagnostic | TransitionDiagnostic | ConfusionDiagnostic)[] {
  if (preferences.activeTab === "transition") return transitionRows(model, preferences, state);
  if (preferences.activeTab === "confusion") return confusionRows(model, preferences, state);
  return keyRows(model, preferences, state);
}

function keyboardSignals(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): ReadonlyMap<TokenId, KeyboardSignal> {
  const result = new Map<TokenId, KeyboardSignal>();
  if (preferences.activeTab === "key") {
    const rows = keyRows(model, preferences, state);
    rows.forEach((row, index) => {
      const badge = preferences.keySort === "timing"
        ? row.timingMs === null ? null : String(Math.round(row.timingMs))
        : row.displayedErrorRatio === null ? null : percent(row.displayedErrorRatio);
      result.set(row.tokenId, {
        badge,
        strength: Math.max(0.18, 1 - index / Math.max(1, rows.length)),
        connected: true,
        selected: state.selectedKey === row.tokenId,
      });
    });
    return result;
  }

  const rows = visibleRowsForTab(model, preferences, state);
  const relationCounts = new Map<TokenId, number>();
  for (const row of rows) {
    const tokens = "fromTokenId" in row
      ? [row.fromTokenId, row.toTokenId]
      : "expectedTokenId" in row
        ? [row.expectedTokenId, row.actualTokenId]
        : [row.tokenId];
    for (const tokenId of tokens) {
      relationCounts.set(tokenId, (relationCounts.get(tokenId) ?? 0) + 1);
    }
  }
  const maximum = Math.max(1, ...relationCounts.values());
  for (const [tokenId, count] of relationCounts) {
    result.set(tokenId, {
      badge: String(count),
      strength: Math.max(0.24, count / maximum),
      connected: true,
      selected: state.selectedKey === tokenId,
    });
  }
  if (state.selectedKey !== null && !result.has(state.selectedKey)) {
    result.set(state.selectedKey, {
      badge: null,
      strength: 1,
      connected: false,
      selected: true,
    });
  }
  return result;
}

export function diagnosticKeyboardTokenLabel(code: string): string | null {
  const tokenId = STANDARD_BOPOMOFO_LAYOUT.bindings[code];
  return tokenId === undefined ? null : tokenLabel(tokenId);
}

function keyboardMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const signals = keyboardSignals(model, preferences, state);
  const visibleCount = visibleRowsForTab(model, preferences, state).length;
  const caption = preferences.activeTab === "key"
    ? "選鍵查看量測。"
    : state.selectedKey === null
      ? "選鍵篩選關係。"
      : "鍵盤與列表同步。";
  return `<section class="diagnostic-analysis-canvas" aria-label="鍵盤診斷視圖">
    <div class="diagnostic-canvas-heading">
      <div><span>${escapeHtml(tabLabel(preferences.activeTab))}</span><strong>${visibleCount} 筆</strong></div>
      <p>${escapeHtml(caption)}</p>
    </div>
    <div class="diagnostic-keyboard-stage">
      <div class="diagnostic-keyboard-board">
        ${KEYBOARD_GEOMETRY_ROWS.map((row) => `<div class="diagnostic-keyboard-row">
          ${row.map((key) => {
            const tokenId = STANDARD_BOPOMOFO_LAYOUT.bindings[key.code];
            const columns = keyboardColumnSpan(key);
            if (tokenId === undefined) {
              return `<span class="diagnostic-keyboard-key unmapped" style="--key-columns:${columns}" aria-hidden="true"></span>`;
            }
            const signal = signals.get(tokenId);
            const classes = [
              "diagnostic-keyboard-key",
              signal?.connected ? "connected" : "",
              signal?.selected ? "selected" : "",
            ].filter(Boolean).join(" ");
            const style = `--key-columns:${columns};--signal-strength:${signal?.strength ?? 0}`;
            return `<button type="button" class="${classes}" style="${style}" data-action="select-key" data-token="${escapeHtml(tokenId)}" aria-pressed="${signal?.selected ?? false}" aria-label="${escapeHtml(tokenLabel(tokenId))}，實體鍵 ${escapeHtml(physicalKeyLabel(key.code))}">
              <strong>${escapeHtml(tokenLabel(tokenId))}</strong>
              ${signal?.badge === null || signal?.badge === undefined ? "" : `<em>${escapeHtml(signal.badge)}</em>`}
            </button>`;
          }).join("")}
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function topToggleMarkup(tab: DiagnosticTab, complete: boolean): string {
  return `<div class="diagnostic-view-toggle" aria-label="顯示範圍">
    <button type="button" data-action="set-complete" data-tab="${tab}" data-value="false" aria-pressed="${!complete}">前 5</button>
    <button type="button" data-action="set-complete" data-tab="${tab}" data-value="true" aria-pressed="${complete}">全部</button>
  </div>`;
}

function inspectorToolbarMarkup(
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  if (preferences.activeTab === "key") {
    return `<div class="diagnostic-inspector-toolbar">
      ${topToggleMarkup("key", state.complete.key)}
      <label>排序
        <select data-action="key-sort">
          <option value="error-ratio"${preferences.keySort === "error-ratio" ? " selected" : ""}>錯誤觀察比例</option>
          <option value="timing"${preferences.keySort === "timing" ? " selected" : ""}>有效鍵間時間</option>
        </select>
      </label>
    </div>`;
  }
  if (preferences.activeTab === "transition") {
    return `<div class="diagnostic-inspector-toolbar stacked">
      <div class="diagnostic-segments" aria-label="轉換方向">
        ${([["incoming", "進入"], ["outgoing", "離開"], ["both", "全部"]] as const)
          .map(([value, label]) => `<button type="button" data-action="transition-direction" data-value="${value}" aria-pressed="${preferences.transitionDirection === value}">${label}</button>`).join("")}
      </div>
      <div class="diagnostic-inspector-options">
        <label>至少
          <select data-action="minimum-samples">
            ${MINIMUM_SAMPLE_OPTIONS.map((value) => `<option value="${value}"${preferences.minimumSamples === value ? " selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
        <label class="diagnostic-checkbox"><input type="checkbox" data-action="include-tone"${preferences.includeTone ? " checked" : ""} /> 聲調</label>
        ${topToggleMarkup("transition", state.complete.transition)}
      </div>
    </div>`;
  }
  return `<div class="diagnostic-inspector-toolbar stacked">
    <div class="diagnostic-segments" aria-label="誤按方向">
      ${([["expected", "應按"], ["actual", "按成"], ["both", "全部"]] as const)
        .map(([value, label]) => `<button type="button" data-action="confusion-direction" data-value="${value}" aria-pressed="${preferences.confusionDirection === value}">${label}</button>`).join("")}
    </div>
    <div class="diagnostic-inspector-options">${topToggleMarkup("confusion", state.complete.confusion)}</div>
  </div>`;
}

function keyListRowMarkup(row: KeyDiagnostic, selected: boolean): string {
  const primary = row.displayedErrorRatio === null ? "—" : percent(row.displayedErrorRatio);
  const timing = row.timingAvailability === "not-applicable"
    ? "時間不適用"
    : row.timingMs === null
      ? `${row.timingSamples} 時間樣本`
      : `${milliseconds(row.timingMs)} · ${row.timingSamples} 樣本`;
  return `<button type="button" class="diagnostic-inspector-row${selected ? " selected" : ""}" data-action="select-key" data-token="${escapeHtml(row.tokenId)}" aria-pressed="${selected}">
    <span class="diagnostic-inspector-identity"><strong>${escapeHtml(row.symbol)}</strong><small>${escapeHtml(row.physicalKey)}</small></span>
    <span class="diagnostic-inspector-main"><strong>${escapeHtml(primary)}</strong><small>${escapeHtml(timing)}</small></span>
    ${stateBadgeMarkup(row.overallDataState)}
  </button>`;
}

function transitionListRowMarkup(row: TransitionDiagnostic, selected: boolean): string {
  return `<button type="button" class="diagnostic-inspector-row relation${selected ? " selected" : ""}" data-action="select-relation" data-id="${escapeHtml(row.id)}" aria-pressed="${selected}">
    <span class="diagnostic-relation-pair"><strong>${escapeHtml(row.fromSymbol)}</strong><small>${escapeHtml(row.fromPhysicalKey)}</small><i>→</i><strong>${escapeHtml(row.toSymbol)}</strong><small>${escapeHtml(row.toPhysicalKey)}</small></span>
    <span class="diagnostic-inspector-main"><strong>${milliseconds(row.timingMs)}</strong><small>${row.timingSamples} 樣本</small></span>
    ${stateBadgeMarkup(row.dataState)}
  </button>`;
}

function confusionListRowMarkup(row: ConfusionDiagnostic, selected: boolean): string {
  return `<button type="button" class="diagnostic-inspector-row relation${selected ? " selected" : ""}" data-action="select-relation" data-id="${escapeHtml(row.id)}" aria-pressed="${selected}">
    <span class="diagnostic-relation-pair"><strong>${escapeHtml(row.expectedSymbol)}</strong><small>${escapeHtml(row.expectedPhysicalKey)}</small><i>→</i><strong>${escapeHtml(row.actualSymbol)}</strong><small>${escapeHtml(row.actualPhysicalKey)}</small></span>
    <span class="diagnostic-inspector-main"><strong>${row.occurrences} 次</strong><small>同目標占 ${percent(row.expectedErrorShare)}</small></span>
    ${stateBadgeMarkup(row.dataState)}
  </button>`;
}

function keySampleNotices(row: KeyDiagnostic): string {
  const notices: string[] = [];
  if (row.errorDataState !== "sufficient") {
    notices.push(`<div><dt>錯誤觀察</dt><dd>${escapeHtml(diagnosticDataStateLabel(row.errorDataState))}</dd></div>`);
  }
  if (row.timingAvailability === "not-applicable") {
    notices.push("<div><dt>鍵間時間</dt><dd>不適用</dd></div>");
  } else if (row.timingDataState !== null && row.timingDataState !== "sufficient") {
    notices.push(`<div><dt>鍵間時間</dt><dd>${escapeHtml(diagnosticDataStateLabel(row.timingDataState))}</dd></div>`);
  } else if (row.timingDataState === null) {
    notices.push("<div><dt>鍵間時間</dt><dd>資料不足</dd></div>");
  }
  if (notices.length === 0) return "";
  return `<section><h4>樣本提示</h4><dl class="diagnostic-detail-lines">${notices.join("")}</dl></section>`;
}

function keyTimingCaption(row: KeyDiagnostic): string {
  if (row.timingAvailability === "not-applicable") return "不適用";
  if (row.timingDataState === "insufficient" || row.timingDataState === null) return "資料不足";
  if (row.timingDataState === "preliminary") return "初步";
  return `${row.timingSamples} 樣本`;
}

function keyDetailMarkup(row: KeyDiagnostic | null): string {
  if (row === null) return '<div class="diagnostic-detail-empty">選一個按鍵查看量測。</div>';
  return `<article class="diagnostic-detail-card">
    <header><div><span>按鍵</span><h3>${escapeHtml(row.symbol)} <small>${escapeHtml(row.physicalKey)}</small></h3></div>${detailStateMarkup(row.overallDataState)}</header>
    <dl class="diagnostic-detail-metrics">
      <div><dt>錯誤觀察比例</dt><dd>${row.displayedErrorRatio === null ? "—" : percent(row.displayedErrorRatio)}</dd><small>${row.errors} / ${row.attempts}</small></div>
      <div><dt>有效鍵間時間</dt><dd>${row.timingMs === null ? "—" : milliseconds(row.timingMs)}</dd><small>${escapeHtml(keyTimingCaption(row))}</small></div>
      <div><dt>最佳時間</dt><dd>${row.bestTimingMs === null ? "—" : milliseconds(row.bestTimingMs)}</dd><small>${row.timingSamples} 樣本</small></div>
      <div><dt>選題倍率</dt><dd>${boost(row.reinforcement.expectedTokenBoost)}</dd><small>${escapeHtml(row.reinforcement.label)}</small></div>
    </dl>
    ${keySampleNotices(row)}
    <section><h4>未計入時間</h4><dl class="diagnostic-detail-lines four">
      <div><dt>音節起始</dt><dd>${row.excludedSamples.syllableStart}</dd></div>
      <div><dt>錯誤輸入</dt><dd>${row.excludedSamples.incorrect}</dd></div>
      <div><dt>修正輸入</dt><dd>${row.excludedSamples.recovery}</dd></div>
      <div><dt>輸入干擾</dt><dd>${row.excludedSamples.interactionNoise}</dd></div>
    </dl></section>
    <section><h4>選題原因</h4><p>${escapeHtml(row.reinforcement.reason)}</p></section>
  </article>`;
}

function transitionDetailMarkup(row: TransitionDiagnostic | null): string {
  if (row === null) return '<div class="diagnostic-detail-empty">選一筆轉換查看數值。</div>';
  return `<article class="diagnostic-detail-card relation-detail">
    <header><div><span>轉換</span><h3>${escapeHtml(row.fromSymbol)} <small>${escapeHtml(row.fromPhysicalKey)}</small> → ${escapeHtml(row.toSymbol)} <small>${escapeHtml(row.toPhysicalKey)}</small></h3></div>${detailStateMarkup(row.dataState)}</header>
    <dl class="diagnostic-detail-metrics three">
      <div><dt>目前</dt><dd>${milliseconds(row.timingMs)}</dd></div>
      <div><dt>最佳</dt><dd>${milliseconds(row.bestTimingMs)}</dd></div>
      <div><dt>樣本</dt><dd>${row.timingSamples}</dd></div>
    </dl>
    <section><h4>計算方式</h4><p>同音節、相鄰且正確的乾淨輸入；反向另計。</p></section>
  </article>`;
}

function confusionDetailMarkup(row: ConfusionDiagnostic | null): string {
  if (row === null) return '<div class="diagnostic-detail-empty">選一筆誤按查看數值。</div>';
  return `<article class="diagnostic-detail-card relation-detail">
    <header><div><span>誤按</span><h3>${escapeHtml(row.expectedSymbol)} <small>${escapeHtml(row.expectedPhysicalKey)}</small> → ${escapeHtml(row.actualSymbol)} <small>${escapeHtml(row.actualPhysicalKey)}</small></h3></div>${detailStateMarkup(row.dataState)}</header>
    <dl class="diagnostic-detail-metrics three">
      <div><dt>此組</dt><dd>${row.occurrences}</dd></div>
      <div><dt>同目標總數</dt><dd>${row.expectedConfusionTotal}</dd></div>
      <div><dt>占比</dt><dd>${percent(row.expectedErrorShare)}</dd></div>
    </dl>
    <section><h4>計算方式</h4><p>分母是同一應按鍵的所有誤按；反向另計。</p></section>
  </article>`;
}

function inspectorMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  if (preferences.activeTab === "key") {
    const rows = keyRows(model, preferences, state);
    const selected = model.keys.find((row) => row.tokenId === state.selectedKey) ?? rows[0] ?? null;
    return `<aside class="diagnostic-analysis-inspector" aria-label="按鍵診斷列表與細節">
      ${inspectorToolbarMarkup(preferences, state)}
      <div class="diagnostic-inspector-list">
        ${rows.length === 0 ? '<p class="diagnostic-inspector-empty">尚無按鍵資料。</p>' : rows.map((row) => keyListRowMarkup(row, selected?.tokenId === row.tokenId)).join("")}
      </div>
      <div class="diagnostic-inspector-detail">${keyDetailMarkup(selected)}</div>
    </aside>`;
  }
  if (preferences.activeTab === "transition") {
    const rows = transitionRows(model, preferences, state);
    const selected = rows.find((row) => row.id === state.selectedRelationId) ?? rows[0] ?? null;
    return `<aside class="diagnostic-analysis-inspector" aria-label="轉換診斷列表與細節">
      ${inspectorToolbarMarkup(preferences, state)}
      <div class="diagnostic-inspector-list">
        ${rows.length === 0 ? '<p class="diagnostic-inspector-empty">此範圍沒有轉換資料。</p>' : rows.map((row) => transitionListRowMarkup(row, selected?.id === row.id)).join("")}
      </div>
      <div class="diagnostic-inspector-detail">${transitionDetailMarkup(selected)}</div>
    </aside>`;
  }
  const rows = confusionRows(model, preferences, state);
  const selected = rows.find((row) => row.id === state.selectedRelationId) ?? rows[0] ?? null;
  return `<aside class="diagnostic-analysis-inspector" aria-label="誤按診斷列表與細節">
    ${inspectorToolbarMarkup(preferences, state)}
    <div class="diagnostic-inspector-list">
      ${rows.length === 0 ? '<p class="diagnostic-inspector-empty">此範圍沒有誤按資料。</p>' : rows.map((row) => confusionListRowMarkup(row, selected?.id === row.id)).join("")}
    </div>
    <div class="diagnostic-inspector-detail">${confusionDetailMarkup(selected)}</div>
  </aside>`;
}

function loadPreferences(storage: DiagnosticPreferenceStorage): DiagnosticPreferences {
  try {
    return loadDiagnosticPreferences(storage);
  } catch {
    return DEFAULT_DIAGNOSTIC_PREFERENCES;
  }
}

export function createDiagnosticAnalysis(
  options: DiagnosticAnalysisOptions,
): DiagnosticAnalysisController {
  const host = document.createElement("section");
  host.id = "diagnostic-analysis";
  host.className = "diagnostic-analysis";
  host.hidden = true;
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-labelledby", "diagnostic-analysis-title");
  document.body.append(host);

  let model = options.getModel();
  let preferences = loadPreferences(options.storage);
  let state: EphemeralDiagnosticState = {
    selectedKey: null,
    selectedRelationId: null,
    complete: { key: false, transition: false, confusion: false },
  };
  let closingTimer: number | null = null;

  const persist = (): void => {
    try {
      saveDiagnosticPreferences(options.storage, preferences);
    } catch {
      // Preferences remain active for this analysis session when storage is unavailable.
    }
  };

  const render = (): void => {
    host.innerHTML = `<div class="diagnostic-analysis-shell">
      <header class="diagnostic-analysis-header">
        <div class="diagnostic-analysis-title-block">
          <span>練習分析</span>
          <h2 id="diagnostic-analysis-title">弱點診斷</h2>
          <p>${escapeHtml(summaryText(model))}</p>
        </div>
        <div class="diagnostic-analysis-tabs" role="tablist" aria-label="弱點診斷類型">
          ${DIAGNOSTIC_TABS.map((tab) => `<button id="${tabButtonId(tab)}" type="button" role="tab" data-action="select-tab" data-tab="${tab}" aria-selected="${preferences.activeTab === tab}" aria-controls="${tabPanelId(tab)}" tabindex="${preferences.activeTab === tab ? 0 : -1}">${tabLabel(tab)}</button>`).join("")}
        </div>
        <button type="button" class="diagnostic-analysis-close" data-action="close-analysis">返回練習 <span aria-hidden="true">Esc</span></button>
      </header>
      <div id="${tabPanelId(preferences.activeTab)}" class="diagnostic-analysis-body" role="tabpanel" aria-labelledby="${tabButtonId(preferences.activeTab)}">
        ${overviewMarkup(model, preferences, state)}
        ${keyboardMarkup(model, preferences, state)}
        ${inspectorMarkup(model, preferences, state)}
      </div>
    </div>`;
  };

  const finishClose = (): void => {
    closingTimer = null;
    host.hidden = true;
    host.classList.remove("open", "closing");
    document.body.classList.remove("diagnostic-analysis-open");
    const root = document.querySelector<HTMLElement>("#app");
    if (root !== null) root.inert = false;
    const sourceDialog = document.querySelector<HTMLDialogElement>("#information-dialog");
    sourceDialog?.classList.remove("diagnostic-source-hidden");
    if (sourceDialog?.open) sourceDialog.close();
  };

  const close = (): void => {
    if (host.hidden || host.classList.contains("closing")) return;
    host.classList.remove("open");
    host.classList.add("closing");
    if (closingTimer !== null) window.clearTimeout(closingTimer);
    closingTimer = window.setTimeout(finishClose, ANALYSIS_ANIMATION_MS);
  };

  const open = (initialTab?: DiagnosticTab): void => {
    if (closingTimer !== null) {
      window.clearTimeout(closingTimer);
      closingTimer = null;
    }
    model = options.getModel();
    preferences = loadPreferences(options.storage);
    if (initialTab !== undefined) preferences = { ...preferences, activeTab: initialTab };
    state = {
      selectedKey: null,
      selectedRelationId: null,
      complete: { key: false, transition: false, confusion: false },
    };
    const root = document.querySelector<HTMLElement>("#app");
    if (root !== null) root.inert = true;
    document.querySelector<HTMLDialogElement>("#information-dialog")
      ?.classList.add("diagnostic-source-hidden");
    document.body.classList.add("diagnostic-analysis-open");
    host.hidden = false;
    host.classList.remove("closing");
    render();
    window.requestAnimationFrame(() => {
      host.classList.add("open");
      host.querySelector<HTMLButtonElement>(".diagnostic-analysis-close")
        ?.focus({ preventScroll: true });
    });
  };

  host.onclick = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    if (target === null) return;
    const action = target.dataset.action;
    if (action === "close-analysis") {
      close();
      return;
    }
    if (action === "select-tab") {
      const tab = target.dataset.tab;
      if (!isDiagnosticTab(tab)) return;
      preferences = { ...preferences, activeTab: tab };
      state = { ...state, selectedRelationId: null };
      persist();
      render();
      host.querySelector<HTMLButtonElement>(`#${tabButtonId(tab)}`)?.focus();
      return;
    }
    if (action === "set-complete") {
      const tab = target.dataset.tab;
      if (!isDiagnosticTab(tab)) return;
      state = {
        ...state,
        selectedRelationId: null,
        complete: { ...state.complete, [tab]: target.dataset.value === "true" },
      };
      render();
      return;
    }
    if (action === "select-key") {
      const tokenId = target.dataset.token ?? null;
      state = {
        ...state,
        selectedKey: state.selectedKey === tokenId ? null : tokenId,
        selectedRelationId: null,
      };
      render();
      return;
    }
    if (action === "select-relation") {
      const relationId = target.dataset.id ?? null;
      state = { ...state, selectedRelationId: relationId };
      render();
      return;
    }
    if (action === "transition-direction") {
      const value = target.dataset.value;
      if (value !== "incoming" && value !== "outgoing" && value !== "both") return;
      preferences = { ...preferences, transitionDirection: value };
      state = { ...state, selectedRelationId: null };
      persist();
      render();
      return;
    }
    if (action === "confusion-direction") {
      const value = target.dataset.value;
      if (value !== "expected" && value !== "actual" && value !== "both") return;
      preferences = { ...preferences, confusionDirection: value };
      state = { ...state, selectedRelationId: null };
      persist();
      render();
    }
  };

  host.onchange = (event) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    const action = event.target.dataset.action;
    if (action === "key-sort" && event.target instanceof HTMLSelectElement) {
      if (event.target.value !== "error-ratio" && event.target.value !== "timing") return;
      preferences = { ...preferences, keySort: event.target.value };
      state = { ...state, selectedRelationId: null };
    } else if (action === "minimum-samples" && event.target instanceof HTMLSelectElement) {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || !MINIMUM_SAMPLE_OPTIONS.includes(value as typeof MINIMUM_SAMPLE_OPTIONS[number])) return;
      preferences = { ...preferences, minimumSamples: value };
      state = { ...state, selectedRelationId: null };
    } else if (action === "include-tone" && event.target instanceof HTMLInputElement) {
      preferences = { ...preferences, includeTone: event.target.checked };
      state = { ...state, selectedRelationId: null };
    } else {
      return;
    }
    persist();
    render();
  };

  host.onkeydown = (event) => {
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "tab") return;
    const tab = event.target.dataset.tab;
    if (!isDiagnosticTab(tab)) return;
    const currentIndex = DIAGNOSTIC_TABS.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % DIAGNOSTIC_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + DIAGNOSTIC_TABS.length) % DIAGNOSTIC_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = DIAGNOSTIC_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = DIAGNOSTIC_TABS[nextIndex]!;
    preferences = { ...preferences, activeTab: nextTab };
    state = { ...state, selectedRelationId: null };
    persist();
    render();
    host.querySelector<HTMLButtonElement>(`#${tabButtonId(nextTab)}`)?.focus();
  };

  const interceptEscape = (event: KeyboardEvent): void => {
    if (host.hidden || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  };
  window.addEventListener("keydown", interceptEscape, { capture: true });

  return {
    open,
    close,
    destroy(): void {
      window.removeEventListener("keydown", interceptEscape, { capture: true });
      if (closingTimer !== null) window.clearTimeout(closingTimer);
      const root = document.querySelector<HTMLElement>("#app");
      if (root !== null) root.inert = false;
      document.body.classList.remove("diagnostic-analysis-open");
      document.querySelector<HTMLDialogElement>("#information-dialog")
        ?.classList.remove("diagnostic-source-hidden");
      host.remove();
    },
  };
}
