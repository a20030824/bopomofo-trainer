import type { TokenId } from "../core/model.js";
import { physicalKeyLabel, tokenLabel } from "../diagnostics/labels.js";
import type {
  ConfusionDiagnostic,
  TransitionDiagnostic,
} from "../diagnostics/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  buildDiagnosticRelationshipPaths,
  DIAGNOSTIC_RELATIONSHIP_VIEWBOX,
  type DiagnosticRelationshipKind,
  type DiagnosticRelationshipRow,
} from "./diagnostic-relationship-layout.js";

const TOKEN_SEPARATOR = "→";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function tokenPhysicalKey(tokenId: TokenId): string {
  for (const [code, currentTokenId] of Object.entries(STANDARD_BOPOMOFO_LAYOUT.bindings)) {
    if (currentTokenId === tokenId) return physicalKeyLabel(code);
  }
  return "—";
}

function parseRelationId(
  kind: DiagnosticRelationshipKind,
  id: string,
): readonly [TokenId, TokenId] | null {
  const prefix = `${kind}:`;
  if (!id.startsWith(prefix)) return null;
  const tokens = id.slice(prefix.length).split(TOKEN_SEPARATOR);
  if (tokens.length !== 2 || tokens[0] === "" || tokens[1] === "") return null;
  return [tokens[0]!, tokens[1]!];
}

function firstInteger(element: Element | null): number {
  const value = element?.textContent?.match(/\d+/u)?.[0];
  return value === undefined ? 1 : Math.max(1, Number(value));
}

function relationRow(
  kind: DiagnosticRelationshipKind,
  button: HTMLButtonElement,
): DiagnosticRelationshipRow | null {
  const id = button.dataset.id;
  if (id === undefined) return null;
  const tokens = parseRelationId(kind, id);
  if (tokens === null) return null;
  const [fromTokenId, toTokenId] = tokens;
  const fromSymbol = tokenLabel(fromTokenId);
  const toSymbol = tokenLabel(toTokenId);
  const fromPhysicalKey = tokenPhysicalKey(fromTokenId);
  const toPhysicalKey = tokenPhysicalKey(toTokenId);

  if (kind === "transition") {
    const timingMs = firstInteger(button.querySelector(".diagnostic-inspector-main strong"));
    const timingSamples = firstInteger(button.querySelector(".diagnostic-inspector-main small"));
    return {
      id,
      fromTokenId,
      toTokenId,
      fromSymbol,
      toSymbol,
      fromPhysicalKey,
      toPhysicalKey,
      timingMs,
      bestTimingMs: timingMs,
      timingSamples,
      dataState: "sufficient",
      includesTone: fromTokenId.startsWith("tone:") || toTokenId.startsWith("tone:"),
    } satisfies TransitionDiagnostic;
  }

  const occurrences = firstInteger(button.querySelector(".diagnostic-inspector-main strong"));
  return {
    id,
    expectedTokenId: fromTokenId,
    actualTokenId: toTokenId,
    expectedSymbol: fromSymbol,
    actualSymbol: toSymbol,
    expectedPhysicalKey: fromPhysicalKey,
    actualPhysicalKey: toPhysicalKey,
    occurrences,
    expectedConfusionTotal: occurrences,
    expectedErrorShare: 1,
    dataState: "sufficient",
  } satisfies ConfusionDiagnostic;
}

function activeKind(host: HTMLElement): DiagnosticRelationshipKind | null {
  const tab = host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.dataset.tab;
  if (tab === "transition" || tab === "confusion") return tab;
  return null;
}

function renderRelationshipOverlay(host: HTMLElement): void {
  host.querySelector(".diagnostic-relationship-svg")?.remove();
  const kind = activeKind(host);
  if (kind === null) return;
  const board = host.querySelector<HTMLElement>(".diagnostic-keyboard-board");
  if (board === null) return;
  const buttons = [...host.querySelectorAll<HTMLButtonElement>(
    '.diagnostic-inspector-list button[data-action="select-relation"][data-id]',
  )];
  const rows = buttons
    .map((button) => relationRow(kind, button))
    .filter((row): row is DiagnosticRelationshipRow => row !== null);
  if (rows.length === 0) return;
  const selectedId = buttons.find((button) => button.classList.contains("selected"))?.dataset.id ?? null;
  const paths = buildDiagnosticRelationshipPaths(kind, rows, selectedId);
  const markerId = `diagnostic-arrow-${kind}`;
  const viewBox = DIAGNOSTIC_RELATIONSHIP_VIEWBOX;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("diagnostic-relationship-svg", kind);
  svg.setAttribute("viewBox", `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-label", kind === "transition" ? "轉換關係" : "誤按關係");
  svg.innerHTML = `<defs><marker id="${markerId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto" markerUnits="strokeWidth"><path class="diagnostic-relationship-arrow" d="M 0 0 L 8 4 L 0 8 z"></path></marker></defs>${paths.map((path) => {
    const button = buttons.find((candidate) => candidate.dataset.id === path.id);
    const label = button?.textContent?.replace(/\s+/gu, " ").trim() || path.label;
    return `<path class="diagnostic-relationship-path${path.selected ? " selected" : ""}${path.includesTone ? " tone" : ""}" d="${path.path}" style="--relation-width:${path.width};--relation-opacity:${path.opacity}" marker-end="url(#${markerId})" tabindex="0" role="button" data-relation-id="${escapeHtml(path.id)}" aria-pressed="${path.selected}" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)}</title></path>`;
  }).join("")}`;

  for (const path of svg.querySelectorAll<SVGPathElement>(".diagnostic-relationship-path")) {
    const id = path.dataset.relationId;
    if (id === undefined) continue;
    const button = buttons.find((candidate) => candidate.dataset.id === id);
    if (button === undefined) continue;
    const activate = (): void => button.click();
    path.addEventListener("click", activate);
    path.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    });
    path.addEventListener("pointerenter", () => button.classList.add("graph-hover"));
    path.addEventListener("pointerleave", () => button.classList.remove("graph-hover"));
    button.addEventListener("pointerenter", () => path.classList.add("list-hover"));
    button.addEventListener("pointerleave", () => path.classList.remove("list-hover"));
    button.addEventListener("focus", () => path.classList.add("list-hover"));
    button.addEventListener("blur", () => path.classList.remove("list-hover"));
  }
  board.prepend(svg);
}

export function mountDiagnosticRelationshipEnhancement(): () => void {
  const host = document.querySelector<HTMLElement>("#diagnostic-analysis");
  if (host === null) return () => undefined;
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      renderRelationshipOverlay(host);
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  schedule();
  return () => observer.disconnect();
}
