import { buildDiagnosticModel } from "../diagnostics/build-model.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
} from "../product/session.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  EVALUATION_CATALOG,
  PRACTICE_CATALOG,
  SYNTAX_PROFILES,
} from "./generated/catalog.js";
import { loadLocalProductProgress } from "./local-progress.js";
import { renderDiagnosticPanel } from "./diagnostic-panel.js";
import {
  DEFAULT_SELECTION_TUNING,
  loadSelectionTuning,
  policyForSelectionTuning,
} from "./selection-tuning.js";

function currentDiagnosticModel() {
  let tuning = DEFAULT_SELECTION_TUNING;
  try {
    tuning = loadSelectionTuning(localStorage);
  } catch {
    // The default policy still yields a complete read-only diagnostic model.
  }
  const environment = createProductEnvironment(
    {
      practice: PRACTICE_CATALOG,
      evaluation: EVALUATION_CATALOG,
      syntaxProfiles: SYNTAX_PROFILES,
    },
    undefined,
    undefined,
    policyForSelectionTuning(tuning),
  );
  let progress = null;
  try {
    progress = loadLocalProductProgress(
      localStorage,
      environment,
      "guided",
      STANDARD_BOPOMOFO_LAYOUT.id,
    ).progress;
  } catch {
    // Storage may be blocked; an empty diagnostic model remains usable.
  }
  progress ??= createFreshProgressForEnvironment(
    environment,
    "diagnostic-empty",
    "guided",
    STANDARD_BOPOMOFO_LAYOUT.id,
  );
  const product = createProductState(environment, progress, performance.now());
  return buildDiagnosticModel({
    measurements: progress.measurements,
    curriculum: progress.curriculum,
    curriculumPolicy: environment.curriculumPolicy,
    support: environment.practiceSupport,
    layout: STANDARD_BOPOMOFO_LAYOUT,
    focusedTokenId: product.round.focus?.tokenId ?? null,
  });
}

function findLegacyWeakSection(content: HTMLElement): HTMLElement | null {
  for (const section of content.querySelectorAll<HTMLElement>("section.panel-section")) {
    if (section.querySelector("h3")?.textContent?.trim() === "較弱按鍵") return section;
  }
  return null;
}

export function mountDiagnosticEnhancement(): () => void {
  const content = document.querySelector<HTMLElement>("#information-content");
  if (content === null) return () => undefined;
  let scheduled = false;

  const enhance = (): void => {
    scheduled = false;
    const section = findLegacyWeakSection(content);
    if (section === null) return;
    renderDiagnosticPanel(section, currentDiagnosticModel(), localStorage);
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(enhance);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(content, { childList: true, subtree: true });
  schedule();
  return () => observer.disconnect();
}
