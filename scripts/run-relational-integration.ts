import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  runRelationalResearchIntegration,
  serializeRelationalResearchIntegrationReport,
  type RelationalResearchIntegrationFixture,
} from "../src/integration/relational-research.js";

const fixtureUrl = new URL(
  "../data/fixtures/integration/relational-research.json",
  import.meta.url,
);
const referenceUrl = new URL(
  "../data/fixtures/integration/reference.csv",
  import.meta.url,
);

const [fixtureSource, referenceInput] = await Promise.all([
  readFile(fixtureUrl, "utf8"),
  readFile(referenceUrl, "utf8"),
]);
const fixture = JSON.parse(fixtureSource) as RelationalResearchIntegrationFixture;
const report = runRelationalResearchIntegration(fixture, referenceInput);
const serialized = serializeRelationalResearchIntegrationReport(report);

if (process.argv.includes("--verify")) {
  const replay = runRelationalResearchIntegration(fixture, referenceInput);
  const replaySerialized = serializeRelationalResearchIntegrationReport(replay);
  if (serialized !== replaySerialized) {
    throw new Error("relational integration replay is not byte-for-byte deterministic");
  }
}

const outputFlag = process.argv.indexOf("--output");
if (outputFlag >= 0) {
  const outputArgument = process.argv[outputFlag + 1];
  if (outputArgument === undefined) throw new Error("--output requires a file path");
  await writeFile(resolve(outputArgument), serialized, "utf8");
} else if (!process.argv.includes("--verify")) {
  process.stdout.write(serialized);
}

process.stderr.write(
  `relational integration ${report.determinismDigest.value} `
  + `(${report.reference.reviewQueue.ranked.length} queued, `
  + `${report.partition.decision.evaluationEntryIds.length} evaluation, `
  + `${report.composition.items.length} practice entries, `
  + `${report.learner.traces.length} traces)\n`,
);
