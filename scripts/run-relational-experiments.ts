import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runRelationalExperiments } from "../src/simulation/experiment/report.js";
import {
  serializeRelationalExperimentCsv,
  serializeRelationalExperimentJson,
  serializeRelationalExperimentMarkdown,
} from "../src/simulation/experiment/serialize.js";
import type { RelationalExperimentPlan } from "../src/simulation/experiment/types.js";

const fixtureUrl = new URL(
  "../data/fixtures/experiment/relational-cohort-v1.json",
  import.meta.url,
);
const plan = JSON.parse(
  await readFile(fixtureUrl, "utf8"),
) as RelationalExperimentPlan;

function render() {
  const report = runRelationalExperiments(plan);
  return {
    report,
    json: serializeRelationalExperimentJson(report),
    csv: serializeRelationalExperimentCsv(report),
    markdown: serializeRelationalExperimentMarkdown(report),
  };
}

const first = render();
if (process.argv.includes("--verify")) {
  const replay = render();
  if (first.json !== replay.json
    || first.csv !== replay.csv
    || first.markdown !== replay.markdown) {
    throw new Error("relational experiment outputs are not byte-for-byte deterministic");
  }
}

const outputFlag = process.argv.indexOf("--output-dir");
if (outputFlag >= 0) {
  const argument = process.argv[outputFlag + 1];
  if (argument === undefined) throw new Error("--output-dir requires a directory path");
  const directory = resolve(argument);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "relational-experiments.json"), first.json, "utf8"),
    writeFile(resolve(directory, "relational-experiments.csv"), first.csv, "utf8"),
    writeFile(resolve(directory, "relational-experiments.md"), first.markdown, "utf8"),
  ]);
}

if (!process.argv.includes("--verify") && outputFlag < 0) {
  process.stdout.write(first.markdown);
}

process.stderr.write(
  "relational experiments " + first.report.determinismDigest
  + " (" + first.report.runCount + " runs, "
  + first.report.aggregates.length + " aggregates)\n",
);
