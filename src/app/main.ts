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
let showKeyboardSketch = true;
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

interface KeyboardSketchKey {
  readonly code: string;
  readonly units?: number;
}

const KEYBOARD_SKETCH_ROWS: readonly (readonly KeyboardSketchKey[])[] = [
  [
    { code: "Backquote" }, { code: "Digit1" }, { code: "Digit2" },
    { code: "Digit3" }, { code: "Digit4" }, { code: "Digit5" },
    { code: "Digit6" }, { code: "Digit7" }, { code: "Digit8" },
    { code: "Digit9" }, { code: "Digit0" }, { code: "Minus" },
    { code: "Equal" }, { code: "Backspace", units: 2 },
  ],
  [
    { code: "Tab", units: 1.5 }, { code: "KeyQ" }, { code: "KeyW" },
    { code: "KeyE" }, { code: "KeyR" }, { code: "KeyT" }, { code: "KeyY" },
    { code: "KeyU" }, { code: "KeyI" }, { code: "KeyO" }, { code: "KeyP" },
    { code: "BracketLeft" }, { code: "BracketRight" }, { code: "Backslash", units: 1.5 },
  ],
  [
    { code: "CapsLock", units: 1.75 }, { code: "KeyA" }, { code: "KeyS" },
    { code: "KeyD" }, { code: "KeyF" }, { code: "KeyG" }, { code: "KeyH" },
    { code: "KeyJ" }, { code: "KeyK" }, { code: "KeyL" },
    { code: "Semicolon" }, { code: "Quote" }, { code: "Enter", units: 2.25 },
  ],
  [
    { code: "ShiftLeft", units: 2.25 }, { code: "KeyZ" }, { code: "KeyX" },
    { code: "KeyC" }, { code: "KeyV" }, { code: "KeyB" }, { code: "KeyN" },
    { code: "KeyM" }, { code: "Comma" }, { code: "Period" }, { code: "Slash" },
    { code: "ShiftRight", units: 2.75 },
  ],
  [
    { code: "ControlLeft", units: 1.5 }, { code: "MetaLeft", units: 1.25 },
    { code: "AltLeft", units: 1.25 }, { code: "Space", units: 7 },
    { code: "AltRight", units: 1.25 }, { code: "MetaRight", units: 1.25 },
    { code: "ControlRight", units: 1.5 },
  ],
];

function keyboardSketchMarkup(): string {
  return KEYBOARD_SKETCH_ROWS.map((row) => `<div class="keyboard-sketch-row">
    ${row.map((key) => `<span class="keyboard-sketch-key${key.units === undefined ? "" : " wide"}" data-code="${key.code}" style="--key-columns:${Math.round((key.units ?? 1) * 4)}"></span>`).join("")}
  </div>`).join("");
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
            <div><h2 id="information-title">設定與資料</h2></div>
            <form method="dialog">
              <button class="dialog-close" type="submit" aria-label="關閉設定面板">Esc</button>
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
      <div id="keyboard-sketch" class="keyboard-sketch" aria-hidden="true">
        <div class="keyboard-sketch-board">${keyboardSketchMarkup()}</div>
      </div>
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
      <strong>偵測到中文輸入法</strong>
      <p>切換到英文鍵盤後直接繼續輸入。</p>
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
  updateKeyboardSketch();
  updatePracticeFeedback();
}

function updateKeyboardSketch(): void {
  const keyboard = requireElement<HTMLElement>("#keyboard-sketch");
  keyboard.hidden = !showKeyboardSketch;
  for (const key of keyboard.querySelectorAll<HTMLElement>(".keyboard-sketch-key")) {
    key.classList.remove("current");
  }
  if (!showKeyboardSketch) return;
  const target = product.session.targets[product.session.position];
  if (target === undefined) return;
  const physicalCode = reverseBindings.get(target.tokenId);
  if (physicalCode === undefined) return;
  const key = keyboard.querySelector<HTMLElement>(
    `.keyboard-sketch-key[data-code="${physicalCode}"]`,
  );
  if (key === null) return;
  key.classList.add("current");
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
    return `<div class="history-record ${record.kind}">
      <div class="history-summary">
        <span class="history-round">${String(record.roundNumber).padStart(2, "0")}</span>
        <span class="history-main"><strong>${accuracyLabel(record.attempts, record.errors)}</strong></span>
        <span class="history-latency">${latency}</span>
      </div>
    </div>`;
  }).join("");
}

function renderInformationPanel(): void {
  const { attempts, errors } = mappedRoundCounts();
  const content = requireElement<HTMLElement>("#information-content");
  content.innerHTML = `
    <section class="panel-section round-overview-section">
      <div class="round-overview">
        <span>第 ${currentRoundNumber()} 句</span>
        <span class="round-accuracy">${accuracyLabel(attempts, errors)}</span>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-heading"><h3>顯示</h3></div>
      <label class="setting-row" for="toggle-physical-hint">
        <span><strong>實體鍵提示</strong><small>只顯示下一個按鍵。</small></span>
        <input id="toggle-physical-hint" type="checkbox"${showPhysicalHint ? " checked" : ""} />
      </label>
    </section>

    <section class="panel-section">
      <div class="panel-heading"><h3>選題權重</h3></div>
      <div class="tuning-controls">
        <label class="tuning-row" for="error-influence">
          <span>錯誤</span><output id="error-influence-value">${Math.round(selectionTuning.errorInfluence * 100)}%</output>
          <input id="error-influence" type="range" min="0" max="300" step="25" value="${Math.round(selectionTuning.errorInfluence * 100)}" />
        </label>
        <label class="tuning-row" for="timing-influence">
          <span>慢速</span><output id="timing-influence-value">${Math.round(selectionTuning.timingInfluence * 100)}%</output>
          <input id="timing-influence" type="range" min="0" max="300" step="25" value="${Math.round(selectionTuning.timingInfluence * 100)}" />
        </label>
      </div>
    </section>

    <section class="panel-section data-section">
      <div class="panel-heading"><h3>本機資料</h3></div>
      ${panelNotice ? `<p class="panel-notice" role="status">${escapeHtml(panelNotice)}</p>` : ""}
      <div class="data-actions">
        <button id="download-backup" class="text-button" type="button">匯出存檔</button>
        <button id="choose-backup" class="text-button" type="button">匯入存檔</button>
        <input id="import-backup" class="visually-hidden" type="file" accept="application/json,.json" />
        <a href="https://github.com/a20030824/bopomofo-trainer" target="_blank" rel="noreferrer">GitHub ↗</a>
      </div>
    </section>

    <section class="panel-section history-section">
      <div class="panel-heading history-heading"><h3>最近紀錄</h3></div>
      <div class="history-list">${renderHistoryRows()}</div>
    </section>

    <section class="panel-section developer-section">
      <details class="developer-tools">
        <summary>進階</summary>
        <div class="developer-tools-body">
          <div class="developer-copy">
            <p>量測診斷與重設。</p>
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
    selectionTuning = { ...selectionTuning, [key]: Number(input.value) / 100 };
    environment = createProductEnvironment(
      catalogs,
      undefined,
      undefined,
      policyForSelectionTuning(selectionTuning),
    );
    try {
      saveSelectionTuning(localStorage, selectionTuning);
      panelNotice = "權重已更新，下一題生效。";
    } catch {
      panelNotice = "權重已套用，但無法保存。";
    }
    renderInformationPanel();
  });
}

function downloadProductBackup(): void {
  downloadJson(
    `bopomofo-backup-${new Date().toISOString().slice(0, 10)}.json`,
    createProductBackup(product.progress, pilotHistory, selectionTuning),
  );
  panelNotice = "存檔已匯出。";
  renderInformationPanel();
}

async function importProductBackup(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (file === undefined) return;
  const backup = parseProductBackup(
    await file.text(),
    environment,
    "guided",
    STANDARD_BOPOMOFO_LAYOUT.id,
  );
  if (backup === null) {
    panelNotice = "無法讀取這份存檔。";
    renderInformationPanel();
    return;
  }
  if (!window.confirm("匯入會取代目前進度，確定繼續嗎？")) {
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
    // Progress persistence below provides the visible storage warning.
  }
  persistProgress();
  panelNotice = "存檔已匯入。";
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
