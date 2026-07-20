import "./auto-advance.css";
import {
  ROUND_AUTO_ADVANCE_DELAY_MS,
  RoundAutoAdvanceController,
  type AutoAdvanceState,
} from "./round-auto-advance.js";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Missing required element: #app");

let activeButton: HTMLButtonElement | null = null;
let activeNote: HTMLParagraphElement | null = null;
const boundButtons = new WeakSet<HTMLButtonElement>();

function noteText(state: AutoAdvanceState): string {
  if (state === "paused") return "已暫停自動前進 · Enter 或按鈕繼續";
  if (state === "scheduled") return "1.2 秒後自動進入下一輪 · Enter 立即 · Esc 暫停";
  return "";
}

function updateNote(state: AutoAdvanceState): void {
  if (activeNote === null) return;
  activeNote.textContent = noteText(state);
  activeNote.dataset.state = state;
}

const controller = new RoundAutoAdvanceController(
  {
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (timerId) => window.clearTimeout(timerId),
  },
  ROUND_AUTO_ADVANCE_DELAY_MS,
  updateNote,
);

function attachNote(button: HTMLButtonElement): void {
  const note = document.createElement("p");
  note.className = "auto-advance-note";
  note.setAttribute("aria-live", "polite");
  button.before(note);
  activeNote = note;
}

function syncCompletionTarget(): void {
  const button = document.querySelector<HTMLButtonElement>("#next-round");
  if (button === activeButton) return;

  activeButton = button;
  activeNote = null;
  if (button !== null) {
    attachNote(button);
    if (!boundButtons.has(button)) {
      boundButtons.add(button);
      button.addEventListener("click", () => controller.observe(null), {
        capture: true,
        once: true,
      });
    }
  }
  controller.observe(button);
}

const observer = new MutationObserver(syncCompletionTarget);
observer.observe(app, { childList: true, subtree: true });
syncCompletionTarget();

document.addEventListener("keydown", (event) => {
  if (!controller.handleKey(event.code)) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

window.addEventListener("beforeunload", () => {
  observer.disconnect();
  controller.dispose();
}, { once: true });
