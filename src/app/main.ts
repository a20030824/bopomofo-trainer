import "./style.css";
import type { Exercise, TokenId } from "../core/model.js";
import {
  applyInteractionInput,
  createInteractionSession,
  type InteractionSessionState,
} from "../practice/interaction-session.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import { SPIKE_CATALOG } from "./generated/catalog.js";
import { keyboardEventToInput } from "./keyboard-adapter.js";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const root = requireElement<HTMLDivElement>("#app");
const capture = requireElement<HTMLTextAreaElement>("#keyboard-capture");
const exercise: Exercise = {
  id: "guided-spike-01",
  mode: "guided",
  layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
  entries: SPIKE_CATALOG,
};

let session: InteractionSessionState = createInteractionSession(exercise, performance.now());
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] ?? character));
}

function focusCapture(): void {
  capture.focus({ preventScroll: true });
}

function renderExercise(): string {
  let position = 0;
  return exercise.entries.map((entry) => {
    const syllables = entry.syllables.map((syllable) => {
      const tokens = syllable.tokens.map((tokenId) => {
        const stateClass = position < session.position
          ? "token done"
          : position === session.position
            ? "token current"
            : "token";
        const token = `<span class="${stateClass}" data-position="${position}">${escapeHtml(tokenLabel(tokenId))}</span>`;
        position += 1;
        return token;
      }).join("");
      return `<span class="syllable">${tokens}</span>`;
    }).join("");

    return `<article class="entry">
      <div class="han">${escapeHtml(entry.prompt.text)}</div>
      <div class="reading">${syllables}</div>
    </article>`;
  }).join("");
}

function traceRows(): string {
  return session.traces.slice(-100).reverse().map((trace) => `<tr>
    <td>${trace.sequence}</td>
    <td>${trace.context}</td>
    <td>${escapeHtml(tokenLabel(trace.expectedToken))}</td>
    <td>${escapeHtml(trace.actualToken === null ? "—" : tokenLabel(trace.actualToken))}</td>
    <td>${escapeHtml(trace.physicalCode)}</td>
    <td>${trace.outcome}</td>
    <td>${Math.round(trace.elapsedSinceAdvanceMs)}</td>
    <td>${trace.recovery ? "yes" : ""}</td>
  </tr>`).join("");
}

function render(): void {
  const current = session.targets[session.position];
  const expectedCode = current === undefined
    ? "—"
    : reverseBindings.get(current.tokenId) ?? "unmapped";
  const expectedDescription = current === undefined
    ? "—"
    : showPhysicalHint
      ? `${tokenLabel(current.tokenId)} · 實體鍵 ${expectedCode}`
      : tokenLabel(current.tokenId);
  const status = imeWarning
    ? "偵測到輸入法組字。請切換成英文鍵盤後再繼續。"
    : session.completed
      ? "Exercise complete. 可下載 trace 或重新開始。"
      : `預期 ${expectedDescription}`;

  root.innerHTML = `
    <main class="shell">
      <header>
        <p class="eyebrow">Disposable measurement spike</p>
        <h1>注音鍵位互動測試</h1>
        <p>切到英文輸入模式。畫面顯示完整注音；空白鍵代表一聲。</p>
      </header>

      <section class="status ${imeWarning ? "warning" : ""}" aria-live="polite">${escapeHtml(status)}</section>
      <section class="exercise" aria-label="guided exercise">${renderExercise()}</section>

      <div class="actions">
        <button id="reset" type="button">開始／重新計時</button>
        <button id="toggle-hint" type="button">${showPhysicalHint ? "隱藏" : "顯示"}實體鍵提示</button>
        <button id="download" type="button">下載 JSON</button>
        <button id="clear-warning" type="button">清除 IME 警告</button>
      </div>

      <section>
        <h2>Raw trace</h2>
        <p class="note">ms 是從上一個成功前進的按鍵開始計時；錯誤後的修正鍵會包含整段 recovery 時間。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>context</th><th>expected</th><th>actual</th><th>code</th><th>outcome</th><th>ms</th><th>recovery</th></tr></thead>
            <tbody>${traceRows()}</tbody>
          </table>
        </div>
      </section>

      <details>
        <summary>JSON</summary>
        <pre>${escapeHtml(JSON.stringify(session.traces, null, 2))}</pre>
      </details>
    </main>`;

  document.querySelector<HTMLButtonElement>("#reset")?.addEventListener("click", reset);
  document.querySelector<HTMLButtonElement>("#toggle-hint")?.addEventListener("click", () => {
    showPhysicalHint = !showPhysicalHint;
    render();
  });
  document.querySelector<HTMLButtonElement>("#download")?.addEventListener("click", downloadTrace);
  document.querySelector<HTMLButtonElement>("#clear-warning")?.addEventListener("click", () => {
    imeWarning = false;
    render();
  });

  focusCapture();
}

function reset(): void {
  session = createInteractionSession(exercise, performance.now());
  imeWarning = false;
  capture.value = "";
  render();
}

function downloadTrace(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    exercise,
    traceOptions: { showPhysicalHint },
    traces: session.traces,
  };
  const url = URL.createObjectURL(new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" },
  ));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bopomofo-spike-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  if (!(event instanceof InputEvent) || !event.isComposing) {
    capture.value = "";
  }
});

capture.addEventListener("keydown", (event) => {
  if (session.completed) return;

  const input = keyboardEventToInput(
    event,
    STANDARD_BOPOMOFO_LAYOUT,
    performance.now(),
    compositionActive,
  );

  if (input.composing) imeWarning = true;
  if (event.code === "Tab" && !input.composing) event.preventDefault();
  session = applyInteractionInput(session, input);
  render();
});

document.addEventListener("click", focusCapture);
window.addEventListener("focus", focusCapture);

render();
