import "./diagnostic-modal.css";
import { buildDiagnosticModel } from "../diagnostics/build-model.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
} from "../product/session.js";
import type { ProductEnvironment } from "../product/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  EVALUATION_CATALOG,
  PRACTICE_CATALOG,
  SYNTAX_PROFILES,
} from "./generated/catalog.js";
import { loadLocalProductProgress } from "./local-progress.js";
import {
  createDiagnosticAnalysis,
  renderDiagnosticSummary,
} from "./diagnostic-panel.js";
import {
  DEFAULT_SELECTION_TUNING,
  loadSelectionTuning,
  policyForSelectionTuning,
  type SelectionTuning,
} from "./selection-tuning.js";

let cachedTuningKey = "";
let cachedEnvironment: ProductEnvironment | null = null;

function environmentForTuning(tuning: SelectionTuning): ProductEnvironment {
  const key = `${tuning.errorInfluence}:${tuning.timingInfluence}`;
  if (cachedEnvironment !== null && cachedTuningKey === key) return cachedEnvironment;
  cachedTuningKey = key;
  cachedEnvironment = createProductEnvironment(
    {
      practice: PRACTICE_CATALOG,
      evaluation: EVALUATION_CATALOG,
      syntaxProfiles: SYNTAX_PROFILES,
    },
    undefined,
    undefined,
    policyForSelectionTuning(tuning),
  );
  return cachedEnvironment;
}

function currentDiagnosticModel() {
  let tuning = DEFAULT_SELECTION_TUNING;
  try {
    tuning = loadSelectionTuning(localStorage);
  } catch {
    // The default policy still yields a complete read-only diagnostic model.
  }
  const environment = environmentForTuning(tuning);
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
  return buildDiagnosticModel({
    measurements: progress.measurements,
    curriculum: progress.curriculum,
    support: environment.practiceSupport,
    layout: STANDARD_BOPOMOFO_LAYOUT,
    selectionPolicy: environment.utterancePolicy,
  });
}

function findLegacyWeakSection(content: HTMLElement): HTMLElement | null {
  for (const section of content.querySelectorAll<HTMLElement>("section.panel-section")) {
    if (section.querySelector("h3")?.textContent?.trim() === "較弱按鍵") return section;
  }
  return null;
}

function mountAnalysisTopLayer(): () => void {
  const analysis = document.querySelector<HTMLElement>("#diagnostic-analysis");
  if (analysis === null) return () => undefined;
  const modal = document.createElement("dialog");
  modal.className = "diagnostic-analysis-modal";
  modal.setAttribute("aria-label", "弱點診斷分析模式");
  analysis.before(modal);
  modal.append(analysis);

  const sync = (): void => {
    if (!analysis.hidden && !modal.open) modal.showModal();
    if (analysis.hidden && modal.open) modal.close();
  };
  const observer = new MutationObserver(sync);
  observer.observe(analysis, { attributes: true, attributeFilter: ["hidden"] });
  modal.addEventListener("cancel", (event) => event.preventDefault());
  sync();

  return () => {
    observer.disconnect();
    if (modal.open) modal.close();
    modal.remove();
  };
}

export function mountDiagnosticEnhancement(): () => void {
  const content = document.querySelector<HTMLElement>("#information-content");
  if (content === null) return () => undefined;
  const analysis = createDiagnosticAnalysis({
    getModel: currentDiagnosticModel,
    storage: localStorage,
  });
  const releaseTopLayer = mountAnalysisTopLayer();
  let scheduled = false;

  const enhance = (): void => {
    scheduled = false;
    const section = findLegacyWeakSection(content);
    if (section === null) return;
    renderDiagnosticSummary(section, currentDiagnosticModel(), () => analysis.open());
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(enhance);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(content, { childList: true, subtree: true });
  schedule();
  return () => {
    observer.disconnect();
    releaseTopLayer();
    analysis.destroy();
  };
}
