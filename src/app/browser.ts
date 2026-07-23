import "./main.js";
import { planBalancedPracticeLines } from "./presentation-model.js";

function requirePracticeStage(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#practice-stage");
  if (element === null) throw new Error("Missing practice stage after app mount");
  return element;
}

const stage = requirePracticeStage();
let layoutFrame: number | null = null;
let centerResizeObserver: ResizeObserver | null = null;

function layoutPracticeRunway(): void {
  const center = stage.querySelector<HTMLElement>(".practice-center");
  const runway = center?.querySelector<HTMLElement>(".utterance-runway") ?? null;
  if (center === null || runway === null) return;

  const entries = [...runway.querySelectorAll<HTMLElement>(".practice-entry")]
    .sort((left, right) =>
      Number(left.dataset.entryIndex) - Number(right.dataset.entryIndex)
    );
  if (entries.length === 0) return;

  runway.style.removeProperty("width");
  runway.replaceChildren(...entries);
  const maxLineWidth = center.clientWidth;
  if (maxLineWidth <= 0) return;

  const entryWidths = entries.map((entry) => entry.getBoundingClientRect().width);
  const lines = planBalancedPracticeLines(entryWidths, maxLineWidth);
  const plannedWidth = Math.min(
    maxLineWidth,
    Math.max(...lines.map((line) => line.width)),
  );
  runway.style.width = `${Math.ceil(plannedWidth)}px`;
  runway.dataset.lineCount = String(lines.length);

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const lineElement = document.createElement("div");
    lineElement.className = "practice-line";
    lineElement.setAttribute("role", "presentation");
    lineElement.append(
      ...entries.slice(line.startEntryIndex, line.endEntryIndex),
    );
    fragment.append(lineElement);
  }
  runway.replaceChildren(fragment);
}

function schedulePracticeLayout(): void {
  if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
  layoutFrame = window.requestAnimationFrame(() => {
    layoutFrame = null;
    layoutPracticeRunway();
  });
}

function connectPracticeCenter(): void {
  centerResizeObserver?.disconnect();
  centerResizeObserver = null;
  if (layoutFrame !== null) {
    window.cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
  }

  layoutPracticeRunway();
  const center = stage.querySelector<HTMLElement>(".practice-center");
  if (center === null || typeof ResizeObserver === "undefined") return;
  centerResizeObserver = new ResizeObserver(schedulePracticeLayout);
  centerResizeObserver.observe(center);
}

const stageObserver = new MutationObserver(connectPracticeCenter);
stageObserver.observe(stage, { childList: true });
connectPracticeCenter();
void document.fonts.ready.then(schedulePracticeLayout);

window.addEventListener("beforeunload", () => {
  stageObserver.disconnect();
  centerResizeObserver?.disconnect();
  if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
}, { once: true });
