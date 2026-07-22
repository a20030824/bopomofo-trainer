import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runRelationalExperiments } from "../src/simulation/experiment/report.js";
import type { RelationalExperimentPlan } from "../src/simulation/experiment/types.js";
import { analyzeRelationalExperiments } from "../src/simulation/analysis/report.js";
import {
  serializeAxisSummariesCsv,
  serializeCellComparisonsCsv,
  serializeRelationalAnalysisJson,
  serializeRelationalAnalysisMarkdown,
} from "../src/simulation/analysis/serialize.js";

const fixtureUrl = new URL(
  "../data/fixtures/experiment/relational-cohort-v1.json",
  import.meta.url,
);
const plan = JSON.parse(
  await readFile(fixtureUrl, "utf8"),
) as RelationalExperimentPlan;

function render() {
  const sourceReport = runRelationalExperiments(plan);
  const analysis = analyzeRelationalExperiments(sourceReport);
  return {
    analysis,
    json: serializeRelationalAnalysisJson(analysis),
    cellCsv: serializeCellComparisonsCsv(analysis),
    axisCsv: serializeAxisSummariesCsv(analysis),
    markdown: serializeRelationalAnalysisMarkdown(analysis),
  };
}

const first = render();
if (process.argv.includes("--verify")) {
  const replay = render();
  if (first.json !== replay.json
    || first.cellCsv !== replay.cellCsv
    || first.axisCsv !== replay.axisCsv
    || first.markdown !== replay.markdown) {
    throw new Error("relational analysis outputs are not byte-for-byte deterministic");
  }
}

if (process.argv.includes("--verify-findings")) {
  const committed = await readFile(
    new URL("../docs/archive/research/strategy-findings.md", import.meta.url),
    "utf8",
  );
  if (committed !== first.markdown) {
    throw new Error("strategy-findings.md does not match the canonical analysis output");
  }
}

const outputFlag = process.argv.indexOf("--output-dir");
if (outputFlag >= 0) {
  const argument = process.argv[outputFlag + 1];
  if (argument === undefined) throw new Error("--output-dir requires a directory path");
  const directory = resolve(argument);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "relational-analysis.json"), first.json, "utf8"),
    writeFile(resolve(directory, "cell-comparisons.csv"), first.cellCsv, "utf8"),
    writeFile(resolve(directory, "axis-summaries.csv"), first.axisCsv, "utf8"),
    writeFile(resolve(directory, "strategy-findings.md"), first.markdown, "utf8"),
  ]);
}

if (!process.argv.includes("--verify")
  && !process.argv.includes("--verify-findings")
  && outputFlag < 0) {
  process.stdout.write(first.markdown);
}

process.stderr.write(
  `relational analysis ${first.analysis.determinismDigest} `
  + `(${first.analysis.comparisons.length} comparisons)\n`,
);
