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
  if (product.round.kind === "evaluation") return "不回灌訓練模型";
  return product.round.focus?.phase === "coverage" ? "基礎覆蓋" : "弱點聚焦";
}

function focusDescription(): string {
  const focus = product.round.focus;
  if (focus === null || focus.tokenId === null) return "廣泛練習";
  const evidence = focus.evidence === "timed" ? "正確率＋乾淨時間" : "正確率證據";
  return `${tokenLabel(focus.tokenId)} · ${evidence}`;
}

function renderExercise(): string {
  let position = 0;
  const currentTarget = product.session.targets[product.session.position];
  return product.round.exercise.entries.map((entry, entryIndex) => {
    const entryState = currentTarget === undefined
      ? "done"
      : entryIndex < currentTarget.entryIndex
        ? "done"
        : entryIndex === currentTarget.entryIndex
          ? "current"
          : "upcoming";
    const syllables = entry.syllables.map((syllable) => {
      const tokens = syllable.tokens.map((tokenId) => {
        const stateClass = position < product.session.position
          ? "token done"
          : position === product.session.position
            ? "token current"
            : "token";
        const expectedCode = reverseBindings.get(tokenId);
        const hint = showPhysicalHint && expectedCode !== undefined
          ? `<small>${escapeHtml(physicalKeyLabel(expectedCode))}</small>`
          : "";
        const token = `<span class="${stateClass}" data-position="${position}"><b>${escapeHtml(tokenLabel(tokenId))}</b>${hint}</span>`;
        position += 1;
        return token;
      }).join("");
      return `<span class="syllable">${tokens}</span>`;
    }).join("");

    return `<article class="entry ${entryState}">
      <div class="entry-index">${String(entryIndex + 1).padStart(2, "0")}</div>
      <div class="han">${escapeHtml(entry.prompt.text)}</div>
      <div class="reading">${syllables}</div>
    </article>`;
  }).join("");
}

function latestInputMessage(): string | null {
  const latest = product.session.traces.at(-1);
  if (latest?.outcome === "incorrect") {
    const actual = latest.actualToken === null ? "未映射鍵" : tokenLabel(latest.actualToken);
    return `剛才按到 ${actual}；游標仍停在 ${tokenLabel(latest.expectedToken)}。`;
  }
  if (latest?.outcome === "unmapped") return "這個實體鍵沒有注音映射，進度未前進。";
  return null;
}

function statusMessage(): string {
  if (imeWarning) return "偵測到輸入法組字。請切換成英文鍵盤後再繼續。";
  if (product.summary !== null) {
    return product.round.kind === "evaluation"
      ? "保留詞檢查完成；結果已獨立保存，不會改變下一輪弱點選擇。"
      : "本輪完成；量測、課程狀態與 Pilot 歷史已保存到這台瀏覽器。";
  }
  const inputMessage = latestInputMessage();
  if (inputMessage !== null) return inputMessage;
  const current = product.session.targets[product.session.position];
  if (current === undefined) return "本輪完成。";
  const expectedCode = reverseBindings.get(current.tokenId) ?? "unmapped";
  return showPhysicalHint
    ? `下一鍵 ${tokenLabel(current.tokenId)} · ${physicalKeyLabel(expectedCode)}`
    : `下一鍵 ${tokenLabel(current.tokenId)}`;
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
  const median = latestPilot?.roundNumber
      === product.progress.practiceRoundsCompleted + product.progress.evaluationRoundsCompleted
    && latestPilot.cleanLatencyMedianMs !== null
    ? `${Math.round(latestPilot.cleanLatencyMedianMs)} ms`
    : "—";
  return `<section class="completion-card" aria-labelledby="completion-title">
    <div>
      <p class="eyebrow">Round complete</p>
      <h2 id="completion-title">${summary.kind === "evaluation" ? "保留詞檢查完成" : "這一輪完成了"}</h2>
      <p>${summary.kind === "evaluation"
        ? "這份結果只用來觀察陌生詞轉移，不會回灌自適應課程。"
        : "累積量測已更新；下一輪會重新判斷 coverage、focus 與 cooldown。"}</p>
    </div>
    <div class="summary-metrics">
      ${metric("正確率", accuracy, `${summary.errors} 次錯誤`)}
      ${metric("有效嘗試", String(summary.attempts), "所有已映射按鍵；排除瀏覽器雜訊")}
      ${metric("乾淨中位時間", median, `${summary.timingSamples} 個合格樣本`)}
    </div>
    <button id="next-round" class="primary" type="button">開始下一輪</button>
  </section>`;
}

function historyPhaseLabel(record: PilotRoundRecord): string {
  if (record.phase === "evaluation") return "保留詞";
  return record.phase === "coverage" ? "基礎覆蓋" : "弱點聚焦";
}

function historyFocusLabel(record: PilotRoundRecord): string {
  if (record.focusTokenId === null) return "—";
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
  const rows = [...pilotHistory.records].reverse().map((record) => {
    const latency = record.cleanLatencyMedianMs === null
      ? "—"
      : `${Math.round(record.cleanLatencyMedianMs)} ms`;
    return `<tr>
      <td>${record.roundNumber}</td>
      <td>${record.kind === "evaluation" ? "評估" : "練習"}</td>
      <td>${historyPhaseLabel(record)}</td>
      <td>${escapeHtml(historyFocusLabel(record))}</td>
      <td>${historyAccuracy(record)}</td>
      <td>${record.errors} / ${record.attempts}</td>
      <td>${record.timingSamples}</td>
      <td>${latency}</td>
      <td>${escapeHtml(historyCompletedAt(record.completedAt))}</td>
      <td class="history-entries">${escapeHtml(record.entryIds.join(" · "))}</td>
    </tr>`;
  }).join("");
  return `<section class="pilot-panel" aria-labelledby="pilot-history-title">
    <div class="pilot-heading">
      <div>
        <p class="eyebrow">Local pilot evidence</p>
        <h2 id="pilot-history-title">最近 ${pilotHistory.records.length} 輪</h2>
        <p>只呈現觀察證據，不宣稱熟練度或學習成效。舊 Phase 5 紀錄缺少單輪 latency 時會顯示「—」。</p>
      </div>
      <button id="download-pilot" type="button">下載 Pilot JSON</button>
    </div>
    <div class="table-wrap pilot-table">
      <table>
        <thead><tr><th>輪</th><th>類型</th><th>階段</th><th>重點</th><th>正確率</th><th>錯誤 / 嘗試</th><th>乾淨樣本</th><th>中位時間</th><th>完成</th><th>詞目</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10">完成第一輪後會開始累積本機 Pilot 歷史。</td></tr>'}</tbody>
      </table>
    </div>
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

function render(): void {
  const statusClass = imeWarning ? "warning" : product.summary !== null ? "complete" : "";
  const progressPercent = currentProgressPercent();
  const completedRounds = product.progress.practiceRoundsCompleted
    + product.progress.evaluationRoundsCompleted;
  const currentRound = product.summary === null ? completedRounds + 1 : completedRounds;
  root.innerHTML = `
    <main class="shell">
      <header class="masthead">
        <div>
          <p class="eyebrow">Guided Bopomofo practice</p>
          <h1>看得見讀音，練的是鍵位。</h1>
          <p class="lede">切換到英文輸入模式，依序輸入完整注音。空白鍵明確代表一聲。</p>
        </div>
        <div class="local-state">
          <span>本機進度</span>
          <strong>${product.progress.practiceRoundsCompleted}</strong>
          <small>已完成練習輪</small>
        </div>
      </header>

      ${recoveredFromInvalidState ? '<div class="notice">舊的本機進度無法安全讀取，已從乾淨狀態重新開始。</div>' : ""}
      ${recoveredPilotHistory ? '<div class="notice">Pilot 歷史格式無法讀取，已從有效的完成摘要重建；舊輪次 latency 會顯示為未知。</div>' : ""}
      ${storageWarning ? `<div class="notice warning">${escapeHtml(storageWarning)}</div>` : ""}

      <section class="round-strip" aria-label="本輪資訊">
        <div><span>Round</span><strong>${String(currentRound).padStart(2, "0")}</strong></div>
        <div><span>模式</span><strong>${roundKindLabel()}</strong></div>
        <div><span>策略</span><strong>${phaseLabel()}</strong></div>
        <div><span>本輪重點</span><strong>${escapeHtml(focusDescription())}</strong></div>
      </section>

      <section class="practice-panel">
        <div class="progress-head">
          <span>${product.session.position} / ${product.session.targets.length} tokens</span>
          <strong>${progressPercent}%</strong>
        </div>
        <div class="progress-track"><span style="width:${progressPercent}%"></span></div>
        <div class="status ${statusClass}" aria-live="polite">${escapeHtml(statusMessage())}</div>
        <div class="exercise" aria-label="guided exercise">${renderExercise()}</div>
      </section>

      ${renderSummary()}

      <div class="actions">
        <button id="toggle-hint" type="button">${showPhysicalHint ? "隱藏" : "顯示"}實體鍵提示</button>
        <button id="download-round" type="button">下載本輪診斷</button>
        ${imeWarning ? '<button id="clear-warning" type="button">清除 IME 警告</button>' : ""}
        <button id="reset-progress" class="danger" type="button">清除本機進度</button>
      </div>

      ${renderPilotHistory()}

      <details class="diagnostics">
        <summary>開發診斷 · raw trace</summary>
        <p>原始事件只用於檢查量測政策；產品不把它包裝成學習分數。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>context</th><th>expected</th><th>actual</th><th>code</th><th>outcome</th><th>ms</th></tr></thead>
            <tbody>${traceRows()}</tbody>
          </table>
        </div>
      </details>
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
    const roundNumber = product.progress.practiceRoundsCompleted
      + product.progress.evaluationRoundsCompleted;
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
