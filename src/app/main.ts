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
  GRAMMAR_ANNOTATIONS,
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
import {
  buildPracticeEntries,
  continuousExerciseText,
} from "./presentation-model.js";

type VisualState = "done" | "current" | "upcoming";

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
  grammarAnnotations: GRAMMAR_ANNOTATIONS,
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

function focusDescription(): string {
  if (product.round.kind === "evaluation") return "保留詞庫 · 不影響出題";
  return "常用度為主 · 錯誤與慢速有限加權";
}

function templateDescription(): string {
  const templateId = product.round.selection.utterance.templateId;
  if (templateId === null) {
    return product.round.selection.utterance.kind === "standalone-utterance"
      ? "完整慣用語"
      : "單詞提示";
  }
  return templateId.replaceAll("-", " · ");
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
              <span>Practice details</span>
              <h2 id="information-title">練習資訊</h2>
            </div>
            <form method="dialog">
              <button class="dialog-close" type="submit" aria-label="關閉資訊面板">Esc</button>
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
      ? "舊的本機進度已保留可驗證量測，新的語句選題從高頻階段開始。"
      : "",
    recoveredPilotHistory
      ? "練習歷史格式無法讀取，已從有效完成摘要重建；舊輪次時間會顯示為未知。"
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
      <strong>偵測到中文輸入法</strong>
      <p>切換到英文鍵盤後按 Esc，繼續目前這一句。</p>
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
    <section class="panel-section current-round-section">
      <div class="panel-heading"><span>Current round</span><h3>${escapeHtml(roundKindLabel())}</h3></div>
      <dl class="fact-grid">
        <div><dt>輪次</dt><dd>${currentRoundNumber()}</dd></div>
        <div><dt>目前正確率</dt><dd>${accuracyLabel(attempts, errors)}</dd></div>
        <div><dt>策略</dt><dd>${escapeHtml(phaseLabel())}</dd></div>
        <div><dt>選題</dt><dd>${escapeHtml(focusDescription())}</dd></div>
        <div><dt>句型</dt><dd>${escapeHtml(templateDescription())}</dd></div>
        <div><dt>輸入</dt><dd>英文鍵盤 · Space 一聲</dd></div>
      </dl>
    </section>

    <section class="panel-section">
      <div class="panel-heading"><span>Display</span><h3>顯示</h3></div>
      <label class="setting-row" for="toggle-physical-hint">
        <span><strong>實體鍵提示</strong><small>只顯示目前注音對應的下一個實體鍵。</small></span>
        <input id="toggle-physical-hint" type="checkbox"${showPhysicalHint ? " checked" : ""} />
      </label>
    </section>

    <section class="panel-section">
      <div class="panel-heading history-heading">
        <div><span>Local history</span><h3>練習紀錄</h3></div>
        <button id="download-pilot" class="text-button" type="button">下載 Pilot JSON</button>
      </div>
      <div class="history-list">${renderHistoryRows()}</div>
    </section>

    <section class="panel-section developer-section">
      <details class="developer-tools">
        <summary>開發與量測診斷</summary>
        <div class="developer-tools-body">
          <div class="developer-copy">
            <strong>Raw trace</strong>
            <p>原始事件只用於檢查量測與出題權重，不代表學習分數。</p>
            <button id="download-round" class="text-button" type="button">下載本句診斷</button>
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
  content.querySelector<HTMLButtonElement>("#download-round")?.addEventListener("click", downloadRoundDiagnostics);
  content.querySelector<HTMLButtonElement>("#download-pilot")?.addEventListener("click", downloadPilotExport);
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

capture.addEventListener("compositionstart", () => {
  compositionActive = true;
  imeWarning = true;
  updatePracticeState();
});

capture.addEventListener("compositionend", () => {
  compositionActive = false;
  capture.value = "";
});

capture.addEventListener("input", (event) => {
  if (!(event instanceof InputEvent) || !event.isComposing) capture.value = "";
});

capture.addEventListener("keydown", (event) => {
  if (imeWarning || requireElement<HTMLDialogElement>("#information-dialog").open) {
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
