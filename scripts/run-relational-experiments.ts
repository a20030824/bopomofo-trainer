import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

const ARTIFACTS = [
  ["relational-experiments.json", serializeRelationalExperimentJson],
  ["relational-experiments.csv", serializeRelationalExperimentCsv],
  ["relational-experiments.md", serializeRelationalExperimentMarkdown],
] as const;

interface RenderSummary {
  readonly determinismDigest: string;
  readonly runCount: number;
  readonly aggregateCount: number;
}

async function renderToDirectory(directory: string): Promise<RenderSummary> {
  await mkdir(directory, { recursive: true });
  const report = runRelationalExperiments(plan);
  const summary: RenderSummary = {
    determinismDigest: report.determinismDigest,
    runCount: report.runCount,
    aggregateCount: report.aggregates.length,
  };
  for (const [filename, serialize] of ARTIFACTS) {
    await writeFile(join(directory, filename), serialize(report), "utf8");
  }
  return summary;
}

async function filesEqual(leftPath: string, rightPath: string): Promise<boolean> {
  const left = await open(leftPath, "r");
  const right = await open(rightPath, "r");
  const leftBuffer = Buffer.allocUnsafe(64 * 1024);
  const rightBuffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  try {
    while (true) {
      const [leftRead, rightRead] = await Promise.all([
        left.read(leftBuffer, 0, leftBuffer.length, position),
        right.read(rightBuffer, 0, rightBuffer.length, position),
      ]);
      if (leftRead.bytesRead !== rightRead.bytesRead) return false;
      if (leftRead.bytesRead === 0) return true;
      if (!leftBuffer.subarray(0, leftRead.bytesRead).equals(
        rightBuffer.subarray(0, rightRead.bytesRead),
      )) return false;
      position += leftRead.bytesRead;
    }
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
}

async function artifactSetsEqual(
  leftDirectory: string,
  rightDirectory: string,
): Promise<boolean> {
  for (const [filename] of ARTIFACTS) {
    if (!await filesEqual(
      join(leftDirectory, filename),
      join(rightDirectory, filename),
    )) return false;
  }
  return true;
}

const verify = process.argv.includes("--verify");
const outputFlag = process.argv.indexOf("--output-dir");
const outputArgument = outputFlag < 0 ? undefined : process.argv[outputFlag + 1];
if (outputFlag >= 0 && outputArgument === undefined) {
  throw new Error("--output-dir requires a directory path");
}
const outputDirectory = outputArgument === undefined ? undefined : resolve(outputArgument);

let summary: RenderSummary;
if (verify) {
  const scratchDirectory = await mkdtemp(join(tmpdir(), "bopomofo-experiment-replay-"));
  const firstDirectory = outputDirectory ?? join(scratchDirectory, "first");
  const replayDirectory = join(scratchDirectory, "replay");
  try {
    summary = await renderToDirectory(firstDirectory);
    const replaySummary = await renderToDirectory(replayDirectory);
    const metadataEqual = summary.determinismDigest === replaySummary.determinismDigest
      && summary.runCount === replaySummary.runCount
      && summary.aggregateCount === replaySummary.aggregateCount;
    if (!metadataEqual || !await artifactSetsEqual(firstDirectory, replayDirectory)) {
      throw new Error("relational experiment outputs are not byte-for-byte deterministic");
    }
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
} else if (outputDirectory !== undefined) {
  summary = await renderToDirectory(outputDirectory);
} else {
  const report = runRelationalExperiments(plan);
  summary = {
    determinismDigest: report.determinismDigest,
    runCount: report.runCount,
    aggregateCount: report.aggregates.length,
  };
  process.stdout.write(serializeRelationalExperimentMarkdown(report));
}

process.stderr.write(
  `relational experiments ${summary.determinismDigest} `
  + `(${summary.runCount} runs, ${summary.aggregateCount} aggregates)\n`,
);
