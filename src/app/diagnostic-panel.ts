import "./diagnostics.css";
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

const KEYBOARD_ROWS = [
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
  ["Space"],
] as const;

const DIAGNOSTIC_TABS = ["key", "transition", "confusion"] as const;
const MINIMUM_SAMPLE_OPTIONS = [1, 3, 5, 8] as const;

interface EphemeralDiagnosticState {
  selectedKey: TokenId | null;
  expandedKey: TokenId | null;
  complete: Readonly<Record<DiagnosticTab, boolean>>;
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

function summaryMarkup(model: DiagnosticModel): string {
  return `${model.summary.keysWithData} 個按鍵已有資料 · ${model.summary.repeatedConfusions} 組重複誤按 · ${model.summary.slowerTransitions} 組較慢轉換`;
}

function tabLabel(tab: DiagnosticTab): string {
  if (tab === "transition") return "轉換";
  if (tab === "confusion") return "誤按";
  return "按鍵";
}

function tabButtonId(tab: DiagnosticTab): string {
  return `diagnostic-tab-${tab}`;
}

function tabPanelId(tab: DiagnosticTab): string {
  return `diagnostic-panel-${tab}`;
}

function topToggleMarkup(tab: DiagnosticTab, complete: boolean): string {
  return `<div class="diagnostic-view-toggle" aria-label="顯示範圍">
    <button type="button" data-action="set-complete" data-tab="${tab}" data-value="false" aria-pressed="${!complete}">Top 5</button>
    <button type="button" data-action="set-complete" data-tab="${tab}" data-value="true" aria-pressed="${complete}">完整列表</button>
  </div>`;
}

function keyPickerMarkup(selectedKey: TokenId | null): string {
  return `<div class="diagnostic-key-picker" aria-label="選擇注音按鍵">
    ${KEYBOARD_ROWS.map((row) => `<div class="diagnostic-key-row">
      ${row.map((code) => {
        const tokenId = STANDARD_BOPOMOFO_LAYOUT.bindings[code];
        if (tokenId === undefined) return "";
        const symbol = tokenLabel(tokenId);
        const physical = physicalKeyLabel(code);
        const selected = selectedKey === tokenId;
        return `<button type="button" class="diagnostic-key${selected ? " selected" : ""}" data-action="select-key" data-token="${escapeHtml(tokenId)}" aria-label="${escapeHtml(symbol)}，實體鍵 ${escapeHtml(physical)}" aria-pressed="${selected}">
          <strong>${escapeHtml(symbol)}</strong><small>${escapeHtml(physical)}</small>
        </button>`;
      }).join("")}
    </div>`).join("")}
  </div>`;
}

function metricStateLabel(row: KeyDiagnostic): string {
  if (row.timingAvailability === "not-applicable") return "目前不適用";
  if (row.timingDataState === null) return "資料不足";
  return diagnosticDataStateLabel(row.timingDataState);
}

function keyRowMarkup(row: KeyDiagnostic, expanded: boolean): string {
  const timing = row.timingAvailability === "not-applicable"
    ? "有效鍵間時間 — · 目前不適用"
    : row.timingMs === null
      ? `有效鍵間時間 — · ${row.timingSamples} 個有效樣本`
      : `有效鍵間時間 ${milliseconds(row.timingMs)} · ${row.timingSamples} 個有效樣本`;
  const ratio = row.displayedErrorRatio === null ? "—" : percent(row.displayedErrorRatio);
  const detailsId = `diagnostic-key-details-${encodeURIComponent(row.tokenId)}`;
  return `<article class="diagnostic-record key-record">
    <button type="button" class="diagnostic-record-toggle" data-action="toggle-key-details" data-token="${escapeHtml(row.tokenId)}" aria-expanded="${expanded}" aria-controls="${detailsId}">
      <span class="diagnostic-identity"><strong>${escapeHtml(row.symbol)}</strong><small>${escapeHtml(row.physicalKey)}</small></span>
      <span class="diagnostic-record-main">
        <span>${escapeHtml(row.errorMetricLabel)} ${ratio} · ${row.attempts} 次嘗試</span>
        <span>${escapeHtml(timing)}</span>
      </span>
      <span class="diagnostic-state">${escapeHtml(diagnosticDataStateLabel(row.overallDataState))}</span>
    </button>
    ${expanded ? `<div id="${detailsId}" class="diagnostic-record-details">
      <h5>個別資料狀態</h5>
      <dl>
        <div><dt>錯誤觀察</dt><dd>${escapeHtml(diagnosticDataStateLabel(row.errorDataState))}</dd></div>
        <div><dt>有效鍵間時間</dt><dd>${escapeHtml(metricStateLabel(row))}</dd></div>
      </dl>
      <h5>按鍵資料</h5>
      <dl>
        <div><dt>錯誤輸入</dt><dd>${row.errors} 次</dd></div>
        <div><dt>最佳有效鍵間時間</dt><dd>${row.bestTimingMs === null ? "—" : milliseconds(row.bestTimingMs)}</dd></div>
      </dl>
      <h5>排除的時間樣本</h5>
      <dl>
        <div><dt>音節起始</dt><dd>${row.excludedSamples.syllableStart}</dd></div>
        <div><dt>錯誤輸入</dt><dd>${row.excludedSamples.incorrect}</dd></div>
        <div><dt>修正輸入</dt><dd>${row.excludedSamples.recovery}</dd></div>
        <div><dt>輸入干擾</dt><dd>${row.excludedSamples.interactionNoise}</dd></div>
      </dl>
      <h5>練習安排</h5>
      <dl>
        <div><dt>狀態</dt><dd>${escapeHtml(row.reinforcement.label)}</dd></div>
        <div><dt>原因</dt><dd>${escapeHtml(row.reinforcement.reason)}</dd></div>
      </dl>
    </div>` : ""}
  </article>`;
}

function transitionRowMarkup(row: TransitionDiagnostic): string {
  return `<article class="diagnostic-record relation-record">
    <div class="diagnostic-relation-title">
      <span><strong>${escapeHtml(row.fromSymbol)}</strong> <small>${escapeHtml(row.fromPhysicalKey)}</small></span>
      <span aria-hidden="true">→</span>
      <span><strong>${escapeHtml(row.toSymbol)}</strong> <small>${escapeHtml(row.toPhysicalKey)}</small></span>
      <span class="diagnostic-state">${escapeHtml(diagnosticDataStateLabel(row.dataState))}</span>
    </div>
    <p>${milliseconds(row.timingMs)} · ${row.timingSamples} 個有效樣本</p>
    <small>最佳 ${milliseconds(row.bestTimingMs)}</small>
  </article>`;
}

function confusionRowMarkup(row: ConfusionDiagnostic): string {
  return `<article class="diagnostic-record relation-record">
    <div class="diagnostic-relation-title">
      <span>應按 <strong>${escapeHtml(row.expectedSymbol)}</strong> <small>${escapeHtml(row.expectedPhysicalKey)}</small></span>
      <span aria-hidden="true">→</span>
      <span>按成 <strong>${escapeHtml(row.actualSymbol)}</strong> <small>${escapeHtml(row.actualPhysicalKey)}</small></span>
      <span class="diagnostic-state">${escapeHtml(diagnosticDataStateLabel(row.dataState))}</span>
    </div>
    <p>${row.occurrences} 次 · 佔 ${escapeHtml(row.expectedSymbol)} 已觀察誤按的 ${percent(row.expectedErrorShare)}</p>
  </article>`;
}

function keyTabMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const rows = selectKeyDiagnostics(
    model.keys.filter((row) => row.attempts > 0),
    preferences.keySort,
    state.complete.key,
  );
  return `<div class="diagnostic-toolbar">
    ${topToggleMarkup("key", state.complete.key)}
    <label>排序
      <select data-action="key-sort">
        <option value="error-ratio"${preferences.keySort === "error-ratio" ? " selected" : ""}>錯誤觀察比例</option>
        <option value="timing"${preferences.keySort === "timing" ? " selected" : ""}>有效鍵間時間</option>
      </select>
    </label>
  </div>
  <div class="diagnostic-record-list">
    ${rows.length === 0
      ? '<p class="diagnostic-empty">尚未有按鍵觀察。</p>'
      : rows.map((row) => keyRowMarkup(row, state.expandedKey === row.tokenId)).join("")}
  </div>
  <p class="diagnostic-footnote">錯誤觀察比例包含輸入與修正過程中的按鍵觀察，不等同第一次作答錯誤率。</p>`;
}

function transitionTabMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const rows = selectTransitionDiagnostics(model.transitions, {
    selectedKey: state.selectedKey,
    direction: preferences.transitionDirection,
    minimumSamples: preferences.minimumSamples,
    includeTone: preferences.includeTone,
    complete: state.complete.transition,
  });
  return `<div class="diagnostic-selection-heading">選取按鍵：<strong>${state.selectedKey === null ? "尚未選取" : escapeHtml(model.keys.find((row) => row.tokenId === state.selectedKey)?.symbol ?? state.selectedKey)}</strong></div>
    ${keyPickerMarkup(state.selectedKey)}
    <div class="diagnostic-toolbar diagnostic-toolbar-wrap">
      <div class="diagnostic-segments" aria-label="轉換方向">
        ${([[
          "incoming", "進入此鍵",
        ], ["outgoing", "離開此鍵"], ["both", "雙向"]] as const).map(([value, label]) => `<button type="button" data-action="transition-direction" data-value="${value}" aria-pressed="${preferences.transitionDirection === value}">${label}</button>`).join("")}
      </div>
      <label>最低樣本
        <select data-action="minimum-samples">
          ${MINIMUM_SAMPLE_OPTIONS.map((value) => `<option value="${value}"${preferences.minimumSamples === value ? " selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
      <label class="diagnostic-checkbox"><input type="checkbox" data-action="include-tone"${preferences.includeTone ? " checked" : ""} /> 包含聲調</label>
      ${topToggleMarkup("transition", state.complete.transition)}
    </div>
    <div class="diagnostic-record-list">
      ${rows.length === 0
        ? `<p class="diagnostic-empty">${state.selectedKey === null ? "尚未有符合門檻的有效鍵間轉換。" : "目前選取與篩選條件下沒有轉換資料。"}</p>`
        : rows.map(transitionRowMarkup).join("")}
    </div>`;
}

function confusionTabMarkup(
  model: DiagnosticModel,
  preferences: DiagnosticPreferences,
  state: EphemeralDiagnosticState,
): string {
  const rows = selectConfusionDiagnostics(model.confusions, {
    selectedKey: state.selectedKey,
    direction: preferences.confusionDirection,
    complete: state.complete.confusion,
  });
  return `<div class="diagnostic-selection-heading">選取按鍵：<strong>${state.selectedKey === null ? "尚未選取" : escapeHtml(model.keys.find((row) => row.tokenId === state.selectedKey)?.symbol ?? state.selectedKey)}</strong></div>
    ${keyPickerMarkup(state.selectedKey)}
    <div class="diagnostic-toolbar diagnostic-toolbar-wrap">
      <div class="diagnostic-segments" aria-label="誤按方向">
        ${([[
          "expected", "應按此鍵",
        ], ["actual", "誤按成此鍵"], ["both", "雙向"]] as const).map(([value, label]) => `<button type="button" data-action="confusion-direction" data-value="${value}" aria-pressed="${preferences.confusionDirection === value}">${label}</button>`).join("")}
      </div>
      ${topToggleMarkup("confusion", state.complete.confusion)}
    </div>
    <div class="diagnostic-record-list">
      ${rows.length === 0
        ? `<p class="diagnostic-empty">${state.selectedKey === null ? "尚未觀察到誤按。" : "目前選取與篩選條件下沒有誤按資料。"}</p>`
        : rows.map(confusionRowMarkup).join("")}
    </div>`;
}

function isDiagnosticTab(value: string | undefined): value is DiagnosticTab {
  return value === "key" || value === "transition" || value === "confusion";
}

export function renderDiagnosticPanel(
  section: HTMLElement,
  model: DiagnosticModel,
  storage: DiagnosticPreferenceStorage,
): void {
  let preferences: DiagnosticPreferences;
  try {
    preferences = loadDiagnosticPreferences(storage);
  } catch {
    preferences = DEFAULT_DIAGNOSTIC_PREFERENCES;
  }
  let state: EphemeralDiagnosticState = {
    selectedKey: null,
    expandedKey: null,
    complete: { key: false, transition: false, confusion: false },
  };

  const persist = (): void => {
    try {
      saveDiagnosticPreferences(storage, preferences);
    } catch {
      // Preferences remain active for this open panel when storage is unavailable.
    }
  };

  const render = (): void => {
    const tabContent = preferences.activeTab === "key"
      ? keyTabMarkup(model, preferences, state)
      : preferences.activeTab === "transition"
        ? transitionTabMarkup(model, preferences, state)
        : confusionTabMarkup(model, preferences, state);
    section.className = "panel-section diagnostic-section";
    section.innerHTML = `<button type="button" class="diagnostic-heading" data-action="toggle-expanded" aria-expanded="${preferences.expanded}" aria-controls="diagnostic-panel-content">
        <span><strong>弱點診斷</strong><small>${escapeHtml(summaryMarkup(model))}</small></span>
        <span aria-hidden="true">${preferences.expanded ? "▴" : "▾"}</span>
      </button>
      ${preferences.expanded ? `<div id="diagnostic-panel-content">
        <div class="diagnostic-tabs" role="tablist" aria-label="弱點診斷類型">
          ${DIAGNOSTIC_TABS.map((tab) => `<button id="${tabButtonId(tab)}" type="button" role="tab" data-action="select-tab" data-tab="${tab}" aria-selected="${preferences.activeTab === tab}" aria-controls="${tabPanelId(tab)}" tabindex="${preferences.activeTab === tab ? 0 : -1}">${tabLabel(tab)}</button>`).join("")}
        </div>
        <div id="${tabPanelId(preferences.activeTab)}" class="diagnostic-tab-panel" role="tabpanel" aria-labelledby="${tabButtonId(preferences.activeTab)}">${tabContent}</div>
      </div>` : ""}`;

    section.onclick = (event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-action]")
        : null;
      if (target === null) return;
      const action = target.dataset.action;
      if (action === "toggle-expanded") {
        preferences = { ...preferences, expanded: !preferences.expanded };
        persist();
        render();
        return;
      }
      if (action === "select-tab") {
        const tab = target.dataset.tab;
        if (!isDiagnosticTab(tab)) return;
        preferences = { ...preferences, activeTab: tab };
        state = { ...state, expandedKey: null };
        persist();
        render();
        return;
      }
      if (action === "set-complete") {
        const tab = target.dataset.tab;
        if (!isDiagnosticTab(tab)) return;
        state = {
          ...state,
          complete: { ...state.complete, [tab]: target.dataset.value === "true" },
        };
        render();
        return;
      }
      if (action === "toggle-key-details") {
        const tokenId = target.dataset.token ?? null;
        state = { ...state, expandedKey: state.expandedKey === tokenId ? null : tokenId };
        render();
        return;
      }
      if (action === "select-key") {
        const tokenId = target.dataset.token ?? null;
        state = { ...state, selectedKey: state.selectedKey === tokenId ? null : tokenId };
        render();
        return;
      }
      if (action === "transition-direction") {
        const value = target.dataset.value;
        if (value !== "incoming" && value !== "outgoing" && value !== "both") return;
        preferences = { ...preferences, transitionDirection: value };
        persist();
        render();
        return;
      }
      if (action === "confusion-direction") {
        const value = target.dataset.value;
        if (value !== "expected" && value !== "actual" && value !== "both") return;
        preferences = { ...preferences, confusionDirection: value };
        persist();
        render();
      }
    };

    section.onchange = (event) => {
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
      const action = event.target.dataset.action;
      if (action === "key-sort" && event.target instanceof HTMLSelectElement) {
        if (event.target.value !== "error-ratio" && event.target.value !== "timing") return;
        preferences = { ...preferences, keySort: event.target.value };
      } else if (action === "minimum-samples" && event.target instanceof HTMLSelectElement) {
        const value = Number(event.target.value);
        if (!Number.isInteger(value) || !MINIMUM_SAMPLE_OPTIONS.includes(value as typeof MINIMUM_SAMPLE_OPTIONS[number])) return;
        preferences = { ...preferences, minimumSamples: value };
      } else if (action === "include-tone" && event.target instanceof HTMLInputElement) {
        preferences = { ...preferences, includeTone: event.target.checked };
      } else {
        return;
      }
      persist();
      render();
    };

    section.onkeydown = (event) => {
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
      state = { ...state, expandedKey: null };
      persist();
      render();
      section.querySelector<HTMLButtonElement>(`#${tabButtonId(nextTab)}`)?.focus();
    };
  };

  render();
}
