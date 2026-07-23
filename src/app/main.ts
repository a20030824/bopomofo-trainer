import "./style.css";
import type { TokenId } from "../core/model.js";
import { createProductBackup, parseProductBackup } from "./backup.js";
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
  SYNTAX_PROFILES,
} from "./generated/catalog.js";
import {
  isInspectionAdvanceShortcut,
  keyboardEventToInput,
} from "./keyboard-adapter.js";
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
import {
  buildPracticeEntries,
  continuousExerciseText,
} from "./presentation-model.js";
import {
  DEFAULT_SELECTION_TUNING,
  loadSelectionTuning,
  policyForSelectionTuning,
  saveSelectionTuning,
  type SelectionTuning,
} from "./selection-tuning.js";

type VisualState = "done" | "current" | "upcoming";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const root = requireElement<HTMLDivElement>("#app");
const capture = requireElement<HTMLTextAreaElement>("#keyboard-capture");
const catalogs = {
  practice: PRACTICE_CATALOG,
  evaluation: EVALUATION_CATALOG,
  syntaxProfiles: SYNTAX_PROFILES,
} as const;
let selectionTuning: SelectionTuning = DEFAULT_SELECTION_TUNING;
try {
  selectionTuning = loadSelectionTuning(localStorage);
} catch {
  // Storage may be blocked; defaults still provide a complete local session.
}
let environment = createProductEnvironment(
  catalogs,
  undefined,
  undefined,
  policyForSelectionTuning(selectionTuning),
);

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
  storageWarning = "瀏覽器無法讀取完整本機資料；練習仍可使用，但練習歷史可能無法保存。";
}

let product: ProductState = createProductState(
  environment,
  initialProgress,
  performance.now(),
);
let compositionActive = false;
let imeWarning = false;
let showPhysicalHint = false;
let previousResult: PilotRoundRecord | null = null;
let previousResultTimer: number | null = null;
let inspectionAdvanceCount = 0;
let panelNotice = "";

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

function completedRoundCount(): number {
  return product.progress.practiceRoundsCompleted
    + product.progress.evaluationRoundsCompleted;
}

function currentRoundNumber(): number {
  return completedRoundCount() + 1;
}

function currentProgressPercent(): number {
  if (product.session.targets.length === 0) return 100;
  return Math.round(
    (product.session.position / product.session.targets.length) * 100,
  );
}

function roundKindLabel(): string {
  return product.round.kind === "evaluation" ? "保留語句評估" : "常用語句練習";
}

function phaseLabel(): string {
  if (product.round.kind === "evaluation") return "只觀察，不回灌";
  return `常用度階段 ${product.round.selection.stage}`;
}

function utteranceText(): string {
  const punctuation = product.round.selection.utterance.punctuation ?? "";
  return `${continuousExerciseText(product.round.exercise)}${punctuation}`;
}

function mappedRoundCounts(): { readonly attempts: number; readonly errors: number } {
  let attempts = 0;
  let errors = 0;
  for (const trace of product.session.traces) {
    if (trace.outcome !== "correct" && trace.outcome !== "incorrect") continue;
    attempts += 1;
    if (trace.outcome === "incorrect") errors += 1;
  }
  return { attempts, errors };
}

function accuracyLabel(attempts: number, errors: number): string {
  if (attempts === 0) return "—";
  return `${Math.round(((attempts - errors) / attempts) * 100)}%`;
}

function focusCapture(): void {
  const dialog = document.querySelector<HTMLDialogElement>("#information-dialog");
  if (dialog?.open || imeWarning) return;
  capture.focus({ preventScroll: true });
}

function mountShell(): void {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="wordmark" aria-label="注音鍵位練習">注音</div>
        <div class="topbar-actions">
          <div id="round-status" class="round-status" aria-live="polite"></div>
          <button id="open-information" class="information-button" type="button" aria-label="開啟練習資訊與設定" aria-keyshortcuts="Escape">i</button>
        </div>
      </header>
      <div id="notice-region" class="notice-region" aria-live="polite"></div>
      <section id="practice-stage" class="practice-stage" aria-label="注音語句練習區"></section>
      <dialog id="information-dialog" class="information-dialog" aria-labelledby="information-title">
        <div class="dialog-shell">
          <header class="dialog-header">
            <div>
              <span>專注練習</span>
              <h2 id="information-title">設定與資料</h2>
            </div>
            <form method="dialog">
              <button class="dialog-close" type="submit" aria-label="關閉設定面板"><span>關閉</span><kbd>Esc</kbd></button>
            </form>
          </header>
          <div id="information-content" class="information-content"></div>
        </div>
      </dialog>
    </main>`;

  requireElement<HTMLButtonElement>("#open-information").addEventListener("click", openInformationPanel);
  const dialog = requireElement<HTMLDialogElement>("#information-dialog");
  dialog.addEventListener("close", focusCapture);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) dialog.close();
  });
  requireElement<HTMLElement>("#practice-stage").addEventListener("click", focusCapture);
}

function renderNotices(): void {
  const notices = [
    recoveredFromInvalidState
      ? "舊版或無效的本機進度已刪除，已從新的進度世代重新開始。"
      : "",
    recoveredPilotHistory
      ? "舊版或無效的 Pilot 歷史已刪除；目前世代可由有效完成摘要補齊。"
      : "",
    storageWarning,
  ].filter(Boolean);
  requireElement<HTMLElement>("#notice-region").innerHTML = notices.map((notice) =>
    `<div class="notice${notice === storageWarning && storageWarning ? " warning" : ""}">${escapeHtml(notice)}</div>`
  ).join("");
}

function practiceEntryMarkup(): string {
  const entries = buildPracticeEntries(product.round.exercise);
  const punctuation = product.round.selection.utterance.punctuation ?? "";
  return entries.map((entry, entryIndex) => {
    const glyphs = entry.glyphs.map((glyph) => {
      const reading = glyph.tokens.map((tokenId, tokenIndex) => {
        const position = glyph.tokenStart + tokenIndex;
        return `<span class="reading-token upcoming" data-position="${position}">${escapeHtml(tokenLabel(tokenId))}</span>`;
      }).join("");
      return `<span class="practice-glyph upcoming" data-token-start="${glyph.tokenStart}" data-token-end="${glyph.tokenEnd}">
        <span class="han-character">${escapeHtml(glyph.character)}</span>
        <span class="syllable-reading" aria-hidden="true">${reading}</span>
      </span>`;
    }).join("");
    const suffix = entryIndex === entries.length - 1 && punctuation
      ? `<span class="utterance-punctuation" aria-hidden="true">${escapeHtml(punctuation)}</span>`
      : "";
    return `<span class="practice-entry" data-entry-index="${entry.entryIndex}">${glyphs}${suffix}</span>`;
  }).join("");
}

function mountPracticeRound(animateRound = false): void {
  const stage = requireElement<HTMLElement>("#practice-stage");
  stage.innerHTML = `
    <div class="practice-center">
      <div class="utterance-runway" aria-label="${escapeHtml(utteranceText())}">
        ${practiceEntryMarkup()}
      </div>
      <div id="practice-feedback" class="practice-feedback" aria-live="polite"></div>
      <div class="progress-line" aria-hidden="true"><span id="progress-fill"></span></div>
      <div class="progress-caption"><span id="progress-count"></span></div>
    </div>`;
  updatePracticeState();

  if (!animateRound) return;
  stage.classList.remove("round-enter");
  void stage.offsetWidth;
  stage.classList.add("round-enter");
  stage.addEventListener("animationend", () => {
    stage.classList.remove("round-enter");
  }, { once: true });
}

function glyphVisualState(tokenStart: number, tokenEnd: number): VisualState {
  if (product.session.position >= tokenEnd) return "done";
  if (product.session.position >= tokenStart) return "current";
  return "upcoming";
}

function tokenVisualState(position: number): VisualState {
  if (position < product.session.position) return "done";
  if (position === product.session.position) return "current";
  return "upcoming";
}

function applyVisualState(element: HTMLElement, state: VisualState): void {
  element.classList.remove("done", "current", "upcoming");
  element.classList.add(state);
  if (state === "current") element.setAttribute("aria-current", "true");
  else element.removeAttribute("aria-current");
}

function updatePracticeFeedback(): void {
  const feedback = requireElement<HTMLElement>("#practice-feedback");
  feedback.className = "practice-feedback";
  feedback.setAttribute("aria-live", "polite");

  if (imeWarning) {
    feedback.classList.add("ime");
    feedback.setAttribute("aria-live", "assertive");
    feedback.innerHTML = `<div class="ime-blocker" role="alert">
      <span>輸入暫停</span>
      <strong>請切換到英文鍵盤</strong>
      <p>切換完成後直接繼續輸入，提示會自動消失。</p>
    </div>`;
    return;
  }

  const latest = product.session.traces.at(-1);
  if (latest?.outcome === "incorrect") {
    const actual = latest.actualToken === null ? "未映射鍵" : tokenLabel(latest.actualToken);
    feedback.classList.add("error");
    feedback.setAttribute("aria-live", "assertive");
    feedback.textContent = `按到 ${actual}，應為 ${tokenLabel(latest.expectedToken)}`;
    return;
  }
  if (latest?.outcome === "unmapped") {
    feedback.classList.add("muted");
    feedback.textContent = "未映射，進度未移動";
    return;
  }

  const current = product.session.targets[product.session.position];
  if (!showPhysicalHint || current === undefined) {
    feedback.textContent = "";
    return;
  }
  const code = reverseBindings.get(current.tokenId);
  const key = code === undefined ? "—" : physicalKeyLabel(code);
  feedback.classList.add("hint");
  feedback.innerHTML = `${escapeHtml(tokenLabel(current.tokenId))}<span>${escapeHtml(key)}</span>`;
}

function updatePracticeState(): void {
  const stage = requireElement<HTMLElement>("#practice-stage");
  const latest = product.session.traces.at(-1);

  for (const glyph of stage.querySelectorAll<HTMLElement>(".practice-glyph")) {
    const tokenStart = Number(glyph.dataset.tokenStart);
    const tokenEnd = Number(glyph.dataset.tokenEnd);
    applyVisualState(glyph, glyphVisualState(tokenStart, tokenEnd));
  }

  for (const token of stage.querySelectorAll<HTMLElement>(".reading-token")) {
    const position = Number(token.dataset.position);
    const state = tokenVisualState(position);
    applyVisualState(token, state);
    const hasError = state === "current"
      && latest?.position === position
      && latest.outcome === "incorrect";
    token.classList.toggle("error", hasError);
  }

  requireElement<HTMLElement>("#progress-fill").style.width = `${currentProgressPercent()}%`;
  requireElement<HTMLElement>("#progress-count").textContent =
    `${product.session.position} / ${product.session.targets.length}`;
  updatePracticeFeedback();
}

function updateTopbar(): void {
  const status = requireElement<HTMLElement>("#round-status");
  if (previousResult !== null) {
    const latency = previousResult.cleanLatencyMedianMs === null
      ? ""
      : ` · ${Math.round(previousResult.cleanLatencyMedianMs)} ms`;
    status.setAttribute("aria-label", "上一句結果");
    status.innerHTML = `<span>上一句</span><strong>${accuracyLabel(previousResult.attempts, previousResult.errors)}${latency}</strong>`;
    return;
  }
  const { attempts, errors } = mappedRoundCounts();
  status.setAttribute("aria-label", `第 ${currentRoundNumber()} 句，目前正確率 ${accuracyLabel(attempts, errors)}`);
  status.innerHTML = `<span>${currentRoundNumber()}</span><strong>${accuracyLabel(attempts, errors)}</strong>`;
}

function clearPreviousResult(): void {
  previousResult = null;
  if (previousResultTimer !== null) window.clearTimeout(previousResultTimer);
  previousResultTimer = null;
  updateTopbar();
}

function showPreviousResult(record: PilotRoundRecord): void {
  previousResult = record;
  if (previousResultTimer !== null) window.clearTimeout(previousResultTimer);
  updateTopbar();
  previousResultTimer = window.setTimeout(() => {
    previousResult = null;
    previousResultTimer = null;
    updateTopbar();
  }, 1400);
}

function historyPhaseLabel(record: PilotRoundRecord): string {
  if (record.phase === "evaluation") return "保留語句";
  return record.phase === "coverage" ? "高頻階段" : "擴充詞庫";
}

function historyFocusLabel(record: PilotRoundRecord): string {
  if (record.focusTokenId === null) return "文法語句";
  const evidence = record.focusEvidence === "timed" ? "時間＋正確" : "正確率";
  return `${tokenLabel(record.focusTokenId)} · ${evidence}`;
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

function renderHistoryRows(): string {
  const records = [...pilotHistory.records].reverse();
  if (records.length === 0) {
    return '<div class="history-empty">完成第一句後，這裡會保留最近的正確率與乾淨中位時間。</div>';
  }
  return records.map((record) => {
    const latency = record.cleanLatencyMedianMs === null
      ? "—"
      : `${Math.round(record.cleanLatencyMedianMs)} ms`;
    return `<details class="history-record ${record.kind}">
      <summary>
        <span class="history-round">${String(record.roundNumber).padStart(2, "0")}</span>
        <span class="history-main"><strong>${accuracyLabel(record.attempts, record.errors)}</strong><small>${historyPhaseLabel(record)} · ${escapeHtml(historyFocusLabel(record))}</small></span>
        <span class="history-latency">${latency}</span>
        <span class="history-date">${escapeHtml(historyCompletedAt(record.completedAt))}</span>
        <span class="history-plus" aria-hidden="true">＋</span>
      </summary>
      <div class="history-detail">
        <span><small>類型</small><strong>${record.kind === "evaluation" ? "評估" : "練習"}</strong></span>
        <span><small>錯誤 / 嘗試</small><strong>${record.errors} / ${record.attempts}</strong></span>
        <span><small>乾淨樣本</small><strong>${record.timingSamples}</strong></span>
        <span><small>句內詞 ID</small><strong>${escapeHtml(record.entryIds.join(" · "))}</strong></span>
      </div>
    </details>`;
  }).join("");
}

function renderInformationPanel(): void {
  const { attempts, errors } = mappedRoundCounts();
  const content = requireElement<HTMLElement>("#information-content");
  content.innerHTML = `
    <section class="panel-section round-overview-section">
      <div class="round-overview">
        <div><span>第 ${currentRoundNumber()} 句</span><strong>${escapeHtml(roundKindLabel())}</strong></div>
        <div class="round-accuracy"><span>目前正確率</span><strong>${accuracyLabel(attempts, errors)}</strong></div>
      </div>
      <div class="round-meta"><span>${escapeHtml(phaseLabel())}</span><span>英文鍵盤 · Space 一聲</span></div>
    </section>

    <section class="panel-section">
      <div class="panel-heading"><span>練習偏好</span><h3>保持畫面安靜</h3></div>
      <label class="setting-row" for="toggle-physical-hint">
        <span><strong>顯示實體鍵提示</strong><small>只提示目前注音所對應的下一個按鍵。</small></span>
        <input id="toggle-physical-hint" type="checkbox"${showPhysicalHint ? " checked" : ""} />
      </label>
    </section>

    <section class="panel-section">
      <div class="panel-heading"><span>自適應強度</span><h3>決定弱點影響多少</h3></div>
      <p class="panel-intro">調整只影響下一題；常用度仍是選詞基礎，總加權最高維持 1.5×。</p>
      <div class="tuning-controls">
        <label class="tuning-row" for="error-influence">
          <span><strong>錯誤影響</strong><small>更常帶回容易按錯的注音。</small></span>
          <output id="error-influence-value">${Math.round(selectionTuning.errorInfluence * 100)}%</output>
          <input id="error-influence" type="range" min="0" max="200" step="25" value="${Math.round(selectionTuning.errorInfluence * 100)}" />
        </label>
        <label class="tuning-row" for="timing-influence">
          <span><strong>慢速影響</strong><small>更常帶回輸入較慢的 token 與音節內轉換。</small></span>
          <output id="timing-influence-value">${Math.round(selectionTuning.timingInfluence * 100)}%</output>
          <input id="timing-influence" type="range" min="0" max="200" step="25" value="${Math.round(selectionTuning.timingInfluence * 100)}" />
        </label>
      </div>
    </section>

    <section class="panel-section data-section">
      <div class="panel-heading"><span>資料</span><h3>帶走你的練習進度</h3></div>
      <p class="panel-intro">進度只存在這台裝置。備份檔包含 seed、量測、階段與最近紀錄。</p>
      ${panelNotice ? `<div class="panel-notice" role="status">${escapeHtml(panelNotice)}</div>` : ""}
      <div class="data-actions">
        <button id="download-backup" class="action-button primary" type="button"><strong>匯出備份</strong><small>下載完整 JSON 存檔</small></button>
        <button id="choose-backup" class="action-button" type="button"><strong>匯入備份</strong><small>從 JSON 還原這台裝置</small></button>
        <input id="import-backup" class="visually-hidden" type="file" accept="application/json,.json" />
      </div>
      <a class="github-link" href="https://github.com/a20030824/bopomofo-trainer" target="_blank" rel="noreferrer"><span>查看原始碼與問題回報</span><strong>GitHub ↗</strong></a>
    </section>

    <section class="panel-section history-section">
      <div class="panel-heading"><span>最近紀錄</span><h3>留意趨勢，不盯著數字</h3></div>
      <div class="history-list">${renderHistoryRows()}</div>
    </section>

    <section class="panel-section developer-section">
      <details class="developer-tools">
        <summary>進階資料與重設</summary>
        <div class="developer-tools-body">
          <div class="developer-copy">
            <strong>開發診斷</strong>
            <p>原始事件與 Pilot export 用於檢查量測，不代表學習分數。</p>
            <div class="inline-actions"><button id="download-round" class="text-button" type="button">本句 trace</button><button id="download-pilot" class="text-button" type="button">Pilot JSON</button></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>context</th><th>expected</th><th>actual</th><th>code</th><th>outcome</th><th>ms</th></tr></thead>
              <tbody>${traceRows()}</tbody>
            </table>
          </div>
          <button id="reset-progress" class="danger-button" type="button">清除所有本機進度</button>
        </div>
      </details>
    </section>`;

  content.querySelector<HTMLInputElement>("#toggle-physical-hint")?.addEventListener("change", (event) => {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    showPhysicalHint = event.currentTarget.checked;
    updatePracticeState();
  });
  bindInfluenceControl(content, "error-influence", "error-influence-value", "errorInfluence");
  bindInfluenceControl(content, "timing-influence", "timing-influence-value", "timingInfluence");
  content.querySelector<HTMLButtonElement>("#download-round")?.addEventListener("click", downloadRoundDiagnostics);
  content.querySelector<HTMLButtonElement>("#download-pilot")?.addEventListener("click", downloadPilotExport);
  content.querySelector<HTMLButtonElement>("#download-backup")?.addEventListener("click", downloadProductBackup);
  const backupInput = content.querySelector<HTMLInputElement>("#import-backup");
  content.querySelector<HTMLButtonElement>("#choose-backup")?.addEventListener("click", () => backupInput?.click());
  backupInput?.addEventListener("change", () => void importProductBackup(backupInput));
  content.querySelector<HTMLButtonElement>("#reset-progress")?.addEventListener("click", resetProgress);
}

function openInformationPanel(): void {
  const dialog = requireElement<HTMLDialogElement>("#information-dialog");
  if (dialog.open) return;
  renderInformationPanel();
  dialog.showModal();
  requireElement<HTMLButtonElement>(".dialog-close").focus({ preventScroll: true });
}

function persistProgress(): void {
  try {
    saveLocalProductProgress(localStorage, product.progress);
    saveLocalPilotHistory(localStorage, pilotHistory);
    storageWarning = "";
  } catch {
    storageWarning = "無法寫入 localStorage；請勿關閉頁面，否則本輪進度可能遺失。";
  }
  renderNotices();
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

function bindInfluenceControl(
  content: HTMLElement,
  inputId: string,
  outputId: string,
  key: keyof SelectionTuning,
): void {
  const input = content.querySelector<HTMLInputElement>(`#${inputId}`);
  const output = content.querySelector<HTMLOutputElement>(`#${outputId}`);
  input?.addEventListener("input", () => {
    if (output !== null) output.value = `${input.value}%`;
  });
  input?.addEventListener("change", () => {
    const influence = Number(input.value) / 100;
    selectionTuning = { ...selectionTuning, [key]: influence };
    environment = createProductEnvironment(
      catalogs,
      undefined,
      undefined,
      policyForSelectionTuning(selectionTuning),
    );
    try {
      saveSelectionTuning(localStorage, selectionTuning);
      panelNotice = "自適應強度已更新，下一題起生效。";
    } catch {
      panelNotice = "設定已套用，但瀏覽器拒絕保存；關閉頁面後會回復預設值。";
    }
    renderInformationPanel();
  });
}

function downloadProductBackup(): void {
  downloadJson(
    `bopomofo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    createProductBackup(product.progress, pilotHistory, selectionTuning),
  );
  panelNotice = "完整備份已下載。";
  renderInformationPanel();
}

async function importProductBackup(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file === undefined) return;
  let backup;
  try {
    backup = parseProductBackup(
      await file.text(),
      environment,
      "guided",
      STANDARD_BOPOMOFO_LAYOUT.id,
    );
  } catch {
    backup = null;
  }
  if (backup === null) {
    panelNotice = "無法讀取這份備份；檔案格式或 catalog 版本不相容。";
    renderInformationPanel();
    return;
  }
  if (!window.confirm("匯入會取代這台裝置目前的練習進度，確定繼續嗎？")) {
    input.value = "";
    return;
  }

  selectionTuning = backup.selectionTuning;
  environment = createProductEnvironment(
    catalogs,
    undefined,
    undefined,
    policyForSelectionTuning(selectionTuning),
  );
  product = createProductState(environment, backup.progress, performance.now());
  pilotHistory = backup.pilotHistory;
  recoveredFromInvalidState = false;
  recoveredPilotHistory = false;
  inspectionAdvanceCount = 0;
  clearPreviousResult();
  try {
    saveSelectionTuning(localStorage, selectionTuning);
  } catch {
    // The progress persistence warning below remains the user-visible failure.
  }
  persistProgress();
  panelNotice = "備份已匯入，練習進度與自適應設定已還原。";
  capture.value = "";
  mountPracticeRound(true);
  updateTopbar();
  renderInformationPanel();
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
  inspectionAdvanceCount = 0;
  clearPreviousResult();
  if (canPersist) persistProgress();
  imeWarning = false;
  capture.value = "";
  requireElement<HTMLDialogElement>("#information-dialog").close();
  renderNotices();
  mountPracticeRound(true);
  updateTopbar();
}

function completeRoundAndAdvance(): void {
  const summary = product.summary;
  if (summary === null) return;
  const roundNumber = completedRoundCount();
  const record = createPilotRoundRecord(
    roundNumber,
    product.round,
    summary,
    product.session.traces,
    environment.measurementPolicy,
  );
  pilotHistory = appendPilotRoundRecord(pilotHistory, record);
  persistProgress();
  product = startNextProductRound(environment, product, performance.now());
  imeWarning = false;
  capture.value = "";
  mountPracticeRound(true);
  showPreviousResult(record);
}

function advanceRoundForInspection(): void {
  const preservedProgress = product.progress;
  const previousUtteranceId = product.round.selection.utterance.id;
  let preview = product;

  // Selection is deterministic by seed. Vary only the temporary selection
  // seed and retry a few times so F8 normally shows a genuinely different
  // prompt without recording a fake completion or modifying learner state.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    inspectionAdvanceCount += 1;
    preview = createProductState(
      environment,
      {
        ...preservedProgress,
        seed: `${preservedProgress.seed}:inspection:${inspectionAdvanceCount}`,
      },
      performance.now(),
    );
    if (preview.round.selection.utterance.id !== previousUtteranceId) break;
  }

  product = { ...preview, progress: preservedProgress };
  imeWarning = false;
  capture.value = "";
  clearPreviousResult();
  mountPracticeRound(true);
  updateTopbar();
  focusCapture();
}

capture.addEventListener("compositionstart", () => {
  compositionActive = true;
  imeWarning = true;
  updatePracticeState();
});

capture.addEventListener("compositionend", () => {
  compositionActive = false;
  imeWarning = false;
  capture.value = "";
  updatePracticeState();
  focusCapture();
});

capture.addEventListener("input", (event) => {
  if (!(event instanceof InputEvent) || !event.isComposing) capture.value = "";
});

capture.addEventListener("keydown", (event) => {
  if (requireElement<HTMLDialogElement>("#information-dialog").open) {
    event.preventDefault();
    return;
  }
  const input = keyboardEventToInput(
    event,
    STANDARD_BOPOMOFO_LAYOUT,
    performance.now(),
    compositionActive,
  );
  if (input.composing) {
    imeWarning = true;
    updatePracticeState();
    return;
  }
  if (imeWarning) {
    imeWarning = false;
    capture.value = "";
  }
  if (event.code === "Space" || event.code === "Tab") event.preventDefault();
  const beforeSummary = product.summary;
  const beforeTraceCount = product.session.traces.length;
  product = applyProductInput(
    environment,
    product,
    input,
    new Date().toISOString(),
  );
  const latest = product.session.traces.at(-1);
  if (
    previousResult !== null
    && product.session.traces.length > beforeTraceCount
    && latest?.outcome === "correct"
  ) {
    clearPreviousResult();
  }
  if (beforeSummary === null && product.summary !== null) {
    completeRoundAndAdvance();
    return;
  }
  updatePracticeState();
  updateTopbar();
});

document.addEventListener("keydown", (event) => {
  if (event.code === "F8") {
    event.preventDefault();
    event.stopPropagation();
    if (
      isInspectionAdvanceShortcut(event)
      && !compositionActive
      && !imeWarning
      && !requireElement<HTMLDialogElement>("#information-dialog").open
    ) {
      advanceRoundForInspection();
    }
    return;
  }
  if (event.code !== "Escape") return;
  const dialog = requireElement<HTMLDialogElement>("#information-dialog");
  if (dialog.open) return;
  event.preventDefault();
  event.stopPropagation();
  if (imeWarning) {
    imeWarning = false;
    capture.value = "";
    updatePracticeState();
    focusCapture();
    return;
  }
  openInformationPanel();
}, { capture: true });

window.addEventListener("focus", focusCapture);

mountShell();
renderNotices();
mountPracticeRound();
updateTopbar();
if (loadedProgress === null) persistProgress();
focusCapture();
