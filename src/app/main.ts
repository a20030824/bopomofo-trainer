import "./style.css";
import type { TokenId } from "../core/model.js";
import { createPilotExport } from "../product/pilot-export.js";
import {
  appendPilotRoundRecord,
  createPilotRoundRecord,
  migratePilotHistory,
  type PilotHistory,
  type PilotRoundRecord,
} from "../product/pilot-history.js";
import {
  applyProductInput,
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
  startNextProductRound,
} from "../product/session.js";
import type { ProductProgress, ProductState } from "../product/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  EVALUATION_CATALOG,
  PRACTICE_CATALOG,
} from "./generated/catalog.js";
import { keyboardEventToInput } from "./keyboard-adapter.js";
import {
  clearLocalPilotHistory,
  loadLocalPilotHistory,
  saveLocalPilotHistory,
} from "./pilot-history.js";
import {
  clearLocalProductProgress,
  loadLocalProductProgress,
  saveLocalProductProgress,
} from "./local-progress.js";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const root = requireElement<HTMLDivElement>("#app");
const capture = requireElement<HTMLTextAreaElement>("#keyboard-capture");
const environment = createProductEnvironment({
  practice: PRACTICE_CATALOG,
  evaluation: EVALUATION_CATALOG,
});

function newSeed(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}`;
}

let storageWarning = "";
let recoveredFromInvalidState = false;
let loadedProgress: ProductProgress | null = null;
try {
  const loaded = loadLocalProductProgress(
    localStorage,
    environment,
    "guided",
    STANDARD_BOPOMOFO_LAYOUT.id,
  );
  loadedProgress = loaded.progress;
  recoveredFromInvalidState = loaded.recoveredFromInvalidState;
} catch {
  storageWarning = "瀏覽器無法讀取本機進度；本次練習仍可使用，但可能無法保存。";
}

const initialProgress = loadedProgress ?? createFreshProgressForEnvironment(
  environment,
  newSeed(),
  "guided",
  STANDARD_BOPOMOFO_LAYOUT.id,
);
let pilotHistory: PilotHistory = migratePilotHistory(initialProgress);
let recoveredPilotHistory = false;
try {
  const loaded = loadLocalPilotHistory(localStorage, initialProgress, environment);
  pilotHistory = loaded.history;
  recoveredPilotHistory = loaded.recoveredFromInvalidState;
} catch {
  storageWarning = "瀏覽器無法讀取完整本機資料；練習仍可使用，但 Pilot 歷史可能無法保存。";
}

let product: ProductState = createProductState(
  environment,
  initialProgress,
  performance.now(),
);
let compositionActive = false;
let imeWarning = false;
let showPhysicalHint = false;

const reverseBindings = new Map<TokenId, string>();
for (const [code, tokenId] of Object.entries(STANDARD_BOPOMOFO_LAYOUT.bindings)) {
  reverseBindings.set(tokenId, code);
}

function tokenLabel(tokenId: TokenId): string {
  if (tokenId.startsWith("zhuyin:")) return tokenId.slice("zhuyin:".length);
  return ({
    "tone:1": "ˉ",
    "tone:2": "ˊ",
    "tone:3": "ˇ",
    "tone:4": "ˋ",
    "tone:5": "˙",
  } as Readonly<Record<string, string>>)[tokenId] ?? tokenId;
}

function physicalKeyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
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

function focusCapture(): void {
  capture.focus({ preventScroll: true });
}

function completedRoundCount(): number {
  return product.progress.practiceRoundsCompleted
    + product.progress.evaluationRoundsCompleted;
}

function currentRoundNumber(): number {
  return product.summary === null ? completedRoundCount() + 1 : completedRoundCount();
}

function currentProgressPercent(): number {
  if (product.session.targets.length === 0) return 100;
  return Math.round(
    (product.session.position / product.session.targets.length) * 100,
  );
}

function roundKindLabel(): string {
  return product.round.kind === "evaluation" ? "保留詞檢查" : "自適應練習";
}

function phaseLabel(): string {
  if (product.round.kind === "evaluation") return "只觀察，不回灌";
  return product.round.focus?.phase === "coverage" ? "基礎覆蓋" : "弱點聚焦";
}

function focusDescription(): string {
  const focus = product.round.focus;
  if (focus === null || focus.tokenId === null) return "廣泛練習";
  const evidence = focus.evidence === "timed" ? "正確率＋乾淨時間" : "正確率證據";
  return `${tokenLabel(focus.tokenId)} · ${evidence}`;
}

function entryStartPositions(): readonly number[] {
  let position = 0;
  return product.round.exercise.entries.map((entry) => {
    const start = position;
    position += entry.syllables.reduce(
      (total, syllable) => total + syllable.tokens.length,
      0,
    );
    return start;
  });
}

function renderReading(entryIndex: number, compact = false): string {
  const entry = product.round.exercise.entries[entryIndex];
  if (entry === undefined) return "";
  let position = entryStartPositions()[entryIndex] ?? 0;
  const latest = product.session.traces.at(-1);

  return entry.syllables.map((syllable) => {
    const tokens = syllable.tokens.map((tokenId) => {
      const isDone = position < product.session.position;
      const isCurrent = position === product.session.position;
      const hasError = isCurrent
        && latest?.position === position
        && latest.outcome === "incorrect";
      const stateClass = [
        "token",
        isDone ? "done" : "",
        isCurrent ? "current" : "",
        hasError ? "error" : "",
        compact ? "compact" : "",
      ].filter(Boolean).join(" ");
      const expectedCode = reverseBindings.get(tokenId);
      const hint = !compact && showPhysicalHint && expectedCode !== undefined
        ? `<small>${escapeHtml(physicalKeyLabel(expectedCode))}</small>`
        : "";
      const token = `<span class="${stateClass}" data-position="${position}"${isCurrent ? ' aria-current="true"' : ""}><b>${escapeHtml(tokenLabel(tokenId))}</b>${hint}</span>`;
      position += 1;
      return token;
    }).join("");
    return `<span class="syllable">${tokens}</span>`;
  }).join("");
}

function compactReading(entryIndex: number): string {
  const entry = product.round.exercise.entries[entryIndex];
  if (entry === undefined) return "";
  return entry.syllables.map((syllable) =>
    syllable.tokens.map(tokenLabel).join("")
  ).join(" ");
}

function activeEntryIndex(): number {
  const current = product.session.targets[product.session.position];
  if (current !== undefined) return current.entryIndex;
  return Math.max(0, product.round.exercise.entries.length - 1);
}

function latestInputMarkup(): string {
  const latest = product.session.traces.at(-1);
  if (latest?.outcome === "incorrect") {
    const actual = latest.actualToken === null ? "未映射鍵" : tokenLabel(latest.actualToken);
    return `<div class="inline-feedback error"><strong>按到 ${escapeHtml(actual)}</strong><span>停在 ${escapeHtml(tokenLabel(latest.expectedToken))}，請再按一次正確鍵。</span></div>`;
  }
  if (latest?.outcome === "unmapped") {
    return '<div class="inline-feedback noise"><strong>這個鍵沒有注音映射</strong><span>進度沒有前進，也不計入正確率。</span></div>';
  }
  return "";
}

function renderExercise(): string {
  const activeIndex = activeEntryIndex();
  const active = product.round.exercise.entries[activeIndex];
  if (active === undefined) return "";
  const current = product.session.targets[product.session.position];
  const activeState = product.summary !== null
    ? "完成"
    : current?.entryIndex === activeIndex
      ? "輸入中"
      : "待輸入";

  const queue = product.round.exercise.entries.map((entry, entryIndex) => {
    const state = product.summary !== null || entryIndex < activeIndex
      ? "done"
      : entryIndex === activeIndex
        ? "current"
        : "upcoming";
    const stateLabel = state === "done" ? "完成" : state === "current" ? "現在" : "稍後";
    return `<li class="queue-entry ${state}">
      <span class="queue-index">${String(entryIndex + 1).padStart(2, "0")}</span>
      <span class="queue-copy"><strong>${escapeHtml(entry.prompt.text)}</strong><small>${escapeHtml(compactReading(entryIndex))}</small></span>
      <span class="queue-state">${stateLabel}</span>
    </li>`;
  }).join("");

  return `<div class="exercise-layout">
    <article class="active-entry${product.session.traces.at(-1)?.outcome === "incorrect" ? " has-error" : ""}">
      <div class="active-entry-head">
        <span>第 ${String(activeIndex + 1).padStart(2, "0")} 詞</span>
        <strong>${activeState}</strong>
      </div>
      <div class="active-han">${escapeHtml(active.prompt.text)}</div>
      <div class="active-reading" aria-label="目前詞的完整注音">${renderReading(activeIndex)}</div>
      ${latestInputMarkup()}
    </article>
    <aside class="entry-queue-wrap" aria-label="本輪詞目順序">
      <div class="queue-heading"><span>本輪詞目</span><strong>${product.round.exercise.entries.length}</strong></div>
      <ol class="entry-queue">${queue}</ol>
    </aside>
  </div>`;
}

function feedbackMarkup(): string {
  if (imeWarning) {
    return `<div class="input-feedback warning" aria-live="assertive">
      <span class="feedback-label">輸入法</span>
      <strong>偵測到組字，請先切換到英文鍵盤。</strong>
      <button id="clear-warning" type="button">已切換，清除提示</button>
    </div>`;
  }
  if (product.summary !== null) {
    const message = product.round.kind === "evaluation"
      ? "結果已獨立保存，不會改變下一輪弱點選擇。"
      : "量測、課程狀態與 Pilot 歷史已保存。";
    return `<div class="input-feedback complete" aria-live="polite"><span class="feedback-label">完成</span><strong>${message}</strong></div>`;
  }
  const latest = product.session.traces.at(-1);
  if (latest?.outcome === "incorrect") {
    return `<div class="input-feedback error" aria-live="assertive"><span class="feedback-label">錯鍵</span><strong>游標未移動，直接重按 ${escapeHtml(tokenLabel(latest.expectedToken))}。</strong></div>`;
  }
  if (latest?.outcome === "unmapped") {
    return '<div class="input-feedback quiet" aria-live="polite"><span class="feedback-label">未映射</span><strong>這次輸入已忽略。</strong></div>';
  }
  const current = product.session.targets[product.session.position];
  if (current === undefined) return "";
  const expectedCode = reverseBindings.get(current.tokenId) ?? "unmapped";
  const key = showPhysicalHint
    ? ` · 實體鍵 ${escapeHtml(physicalKeyLabel(expectedCode))}`
    : "";
  return `<div class="input-feedback" aria-live="polite"><span class="feedback-label">下一鍵</span><strong>${escapeHtml(tokenLabel(current.tokenId))}${key}</strong></div>`;
}

function metric(label: string, value: string, detail: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
}

function renderSummary(): string {
  const summary = product.summary;
  if (summary === null) return "";
  const accuracy = summary.attempts === 0
    ? "—"
    : `${Math.round(((summary.attempts - summary.errors) / summary.attempts) * 100)}%`;
  const latestPilot = pilotHistory.records.at(-1);
  const median = latestPilot?.roundNumber === completedRoundCount()
    && latestPilot.cleanLatencyMedianMs !== null
    ? `${Math.round(latestPilot.cleanLatencyMedianMs)} ms`
    : "—";
  const title = summary.kind === "evaluation" ? "保留詞檢查完成" : "這一輪完成了";
  const copy = summary.kind === "evaluation"
    ? "這份結果只觀察陌生詞表現，不回灌自適應課程。"
    : "下一輪會依累積證據重新判斷 coverage、focus 與 cooldown。";
  return `<section class="completion-card" aria-labelledby="completion-title">
    <div class="completion-copy">
      <p class="eyebrow">Round ${String(completedRoundCount()).padStart(2, "0")}</p>
      <h2 id="completion-title">${title}</h2>
      <p>${copy}</p>
    </div>
    <div class="summary-metrics">
      ${metric("正確率", accuracy, `${summary.errors} 次錯誤`)}
      ${metric("按鍵嘗試", String(summary.attempts), "所有已映射按鍵")}
      ${metric("乾淨中位時間", median, `${summary.timingSamples} 個合格樣本`)}
    </div>
    <button id="next-round" class="primary next-round" type="button">開始下一輪 <span aria-hidden="true">→</span></button>
  </section>`;
}

function historyPhaseLabel(record: PilotRoundRecord): string {
  if (record.phase === "evaluation") return "保留詞";
  return record.phase === "coverage" ? "基礎覆蓋" : "弱點聚焦";
}

function historyFocusLabel(record: PilotRoundRecord): string {
  if (record.focusTokenId === null) return "廣泛練習";
  const evidence = record.focusEvidence === "timed" ? "時間＋正確" : "正確率";
  return `${tokenLabel(record.focusTokenId)} · ${evidence}`;
}

function historyAccuracy(record: PilotRoundRecord): string {
  if (record.attempts === 0) return "—";
  return `${Math.round(((record.attempts - record.errors) / record.attempts) * 100)}%`;
}

function historyCompletedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
}

function renderPilotHistory(): string {
  const records = [...pilotHistory.records].reverse();
  const evaluationCount = records.filter((record) => record.kind === "evaluation").length;
  const rows = records.map((record) => {
    const latency = record.cleanLatencyMedianMs === null
      ? "—"
      : `${Math.round(record.cleanLatencyMedianMs)} ms`;
    return `<details class="history-record ${record.kind}">
      <summary>
        <span class="history-round">${String(record.roundNumber).padStart(2, "0")}</span>
        <span class="history-kind">${record.kind === "evaluation" ? "評估" : "練習"}</span>
        <span class="history-focus"><small>${historyPhaseLabel(record)}</small><strong>${escapeHtml(historyFocusLabel(record))}</strong></span>
        <span class="history-stat"><small>正確率</small><strong>${historyAccuracy(record)}</strong></span>
        <span class="history-stat"><small>中位時間</small><strong>${latency}</strong></span>
        <span class="history-date">${escapeHtml(historyCompletedAt(record.completedAt))}</span>
        <span class="history-open" aria-hidden="true">＋</span>
      </summary>
      <div class="history-detail">
        <span><small>錯誤 / 嘗試</small><strong>${record.errors} / ${record.attempts}</strong></span>
        <span><small>乾淨樣本</small><strong>${record.timingSamples}</strong></span>
        <span class="history-entry-list"><small>詞目 ID</small><strong>${escapeHtml(record.entryIds.join(" · "))}</strong></span>
      </div>
    </details>`;
  }).join("");

  return `<section class="history-section" aria-labelledby="pilot-history-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Local pilot</p>
        <h2 id="pilot-history-title">練習紀錄</h2>
        <p>保留最近 ${pilotHistory.records.length} 輪，其中 ${evaluationCount} 輪為保留詞評估。這些數字是觀察證據，不是熟練度分數。</p>
      </div>
      <button id="download-pilot" class="secondary" type="button">下載 Pilot JSON</button>
    </div>
    <div class="history-list">${rows || '<div class="history-empty"><strong>還沒有完成紀錄</strong><span>完成第一輪後，這裡會顯示正確率、焦點與乾淨中位時間。</span></div>'}</div>
  </section>`;
}

function traceRows(): string {
  return product.session.traces.slice(-60).reverse().map((trace) => `<tr>
    <td>${trace.sequence}</td>
    <td>${trace.context}</td>
    <td>${escapeHtml(tokenLabel(trace.expectedToken))}</td>
    <td>${escapeHtml(trace.actualToken === null ? "—" : tokenLabel(trace.actualToken))}</td>
    <td>${escapeHtml(trace.physicalCode)}</td>
    <td>${trace.outcome}</td>
    <td>${Math.round(trace.elapsedSinceAdvanceMs)}</td>
  </tr>`).join("");
}

function persistProgress(): void {
  try {
    saveLocalProductProgress(localStorage, product.progress);
    saveLocalPilotHistory(localStorage, pilotHistory);
    storageWarning = "";
  } catch {
    storageWarning = "無法寫入 localStorage；請勿關閉頁面，否則本輪進度可能遺失。";
  }
}

function downloadJson(filename: string, source: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadRoundDiagnostics(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    round: product.round,
    exercise: product.round.exercise,
    summary: product.summary,
    traces: product.session.traces,
  };
  downloadJson(`bopomofo-round-${Date.now()}.json`, JSON.stringify(payload, null, 2));
}

function downloadPilotExport(): void {
  downloadJson(
    "bopomofo-pilot.json",
    createPilotExport(environment, product.progress, pilotHistory),
  );
}

function renderNotices(): string {
  return [
    recoveredFromInvalidState
      ? '<div class="notice">舊的本機進度無法安全讀取，已從乾淨狀態重新開始。</div>'
      : "",
    recoveredPilotHistory
      ? '<div class="notice">Pilot 歷史格式無法讀取，已從有效的完成摘要重建；舊輪次時間會顯示為未知。</div>'
      : "",
    storageWarning
      ? `<div class="notice warning">${escapeHtml(storageWarning)}</div>`
      : "",
  ].join("");
}

function render(): void {
  const progressPercent = currentProgressPercent();
  root.innerHTML = `
    <main class="shell">
      <header class="app-bar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">ㄅ</span>
          <div>
            <h1>注音鍵位練習</h1>
            <p>看完整讀音，建立實體鍵位記憶。</p>
          </div>
        </div>
        <div class="app-progress" aria-label="本機進度">
          <span>已完成練習</span>
          <strong>${product.progress.practiceRoundsCompleted}</strong>
          <small>輪</small>
        </div>
      </header>

      ${renderNotices()}

      <section class="session-header" aria-label="本輪資訊">
        <div class="round-identity">
          <span>Round ${String(currentRoundNumber()).padStart(2, "0")}</span>
          <h2>${roundKindLabel()}</h2>
        </div>
        <dl class="session-facts">
          <div><dt>策略</dt><dd>${phaseLabel()}</dd></div>
          <div><dt>本輪重點</dt><dd>${escapeHtml(focusDescription())}</dd></div>
          <div><dt>輸入</dt><dd>英文鍵盤 · Space 一聲</dd></div>
        </dl>
        <button id="toggle-hint" class="hint-toggle" type="button" aria-pressed="${showPhysicalHint}">${showPhysicalHint ? "隱藏" : "顯示"}鍵位提示</button>
      </section>

      <section class="practice-surface" aria-label="注音練習區">
        <div class="practice-progress">
          <span>${product.session.position} / ${product.session.targets.length} 個注音</span>
          <strong>${progressPercent}%</strong>
        </div>
        <div class="progress-track" aria-hidden="true"><span style="width:${progressPercent}%"></span></div>
        ${feedbackMarkup()}
        ${renderExercise()}
      </section>

      ${renderSummary()}
      ${renderPilotHistory()}

      <footer class="utility-footer">
        <details class="developer-tools">
          <summary>開發與量測診斷</summary>
          <div class="developer-tools-body">
            <div class="developer-tools-copy">
              <strong>Raw trace</strong>
              <p>原始事件只用於檢查量測政策，不代表學習分數。</p>
              <button id="download-round" type="button">下載本輪診斷</button>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>#</th><th>context</th><th>expected</th><th>actual</th><th>code</th><th>outcome</th><th>ms</th></tr></thead>
                <tbody>${traceRows()}</tbody>
              </table>
            </div>
          </div>
        </details>
        <button id="reset-progress" class="danger ghost" type="button">清除所有本機進度</button>
      </footer>
    </main>`;

  document.querySelector<HTMLButtonElement>("#next-round")?.addEventListener("click", () => {
    product = startNextProductRound(environment, product, performance.now());
    imeWarning = false;
    capture.value = "";
    render();
  });
  document.querySelector<HTMLButtonElement>("#toggle-hint")?.addEventListener("click", () => {
    showPhysicalHint = !showPhysicalHint;
    render();
  });
  document.querySelector<HTMLButtonElement>("#download-round")?.addEventListener("click", downloadRoundDiagnostics);
  document.querySelector<HTMLButtonElement>("#download-pilot")?.addEventListener("click", downloadPilotExport);
  document.querySelector<HTMLButtonElement>("#clear-warning")?.addEventListener("click", () => {
    imeWarning = false;
    render();
  });
  document.querySelector<HTMLButtonElement>("#reset-progress")?.addEventListener("click", resetProgress);
  focusCapture();
}

function resetProgress(): void {
  const confirmed = window.confirm(
    "這會清除這台瀏覽器中的所有練習、評估與 Pilot 歷史，確定繼續嗎？",
  );
  if (!confirmed) return;
  let canPersist = true;
  try {
    clearLocalProductProgress(localStorage);
    clearLocalPilotHistory(localStorage);
    storageWarning = "";
  } catch {
    canPersist = false;
    storageWarning = "瀏覽器無法清除舊進度，但本頁已重新開始。";
  }
  const progress = createFreshProgressForEnvironment(
    environment,
    newSeed(),
    "guided",
    STANDARD_BOPOMOFO_LAYOUT.id,
  );
  product = createProductState(environment, progress, performance.now());
  pilotHistory = migratePilotHistory(progress);
  recoveredFromInvalidState = false;
  recoveredPilotHistory = false;
  if (canPersist) persistProgress();
  imeWarning = false;
  capture.value = "";
  render();
}

capture.addEventListener("compositionstart", () => {
  compositionActive = true;
  imeWarning = true;
  render();
});

capture.addEventListener("compositionend", () => {
  compositionActive = false;
  capture.value = "";
});

capture.addEventListener("input", (event) => {
  if (!(event instanceof InputEvent) || !event.isComposing) capture.value = "";
});

capture.addEventListener("keydown", (event) => {
  if (product.summary !== null) return;
  const input = keyboardEventToInput(
    event,
    STANDARD_BOPOMOFO_LAYOUT,
    performance.now(),
    compositionActive,
  );
  if (input.composing) imeWarning = true;
  if ((event.code === "Space" || event.code === "Tab") && !input.composing) {
    event.preventDefault();
  }
  const before = product.summary;
  product = applyProductInput(
    environment,
    product,
    input,
    new Date().toISOString(),
  );
  if (before === null && product.summary !== null) {
    const roundNumber = completedRoundCount();
    pilotHistory = appendPilotRoundRecord(
      pilotHistory,
      createPilotRoundRecord(
        roundNumber,
        product.round,
        product.summary,
        product.session.traces,
        environment.measurementPolicy,
      ),
    );
    persistProgress();
  }
  render();
});

document.addEventListener("click", focusCapture);
window.addEventListener("focus", focusCapture);
if (loadedProgress === null) persistProgress();
render();
