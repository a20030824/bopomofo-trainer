import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runRelationalConfirmation } from "../src/simulation/confirmation/report.js";
import {
  serializeConfirmationSurvivalCsv,
  serializeConfirmationTrajectoriesCsv,
  serializeRelationalConfirmationJson,
  serializeRelationalConfirmationMarkdown,
} from "../src/simulation/confirmation/serialize.js";
import type { RelationalConfirmationPlan } from "../src/simulation/confirmation/types.js";

const artifactNames = [
  "relational-confirmation.json",
  "relational-confirmation-trajectories.csv",
  "relational-confirmation-survival.csv",
  "strategy-confirmation.md",
] as const;

const fixtureUrl = new URL(
  "../data/fixtures/experiment/relational-confirmatory-v1.json",
  import.meta.url,
);
const plan = JSON.parse(
  await readFile(fixtureUrl, "utf8"),
) as RelationalConfirmationPlan;

async function render(directory: string) {
  await mkdir(directory, { recursive: true });
  const report = runRelationalConfirmation(plan);
  await Promise.all([
    writeFile(
      resolve(directory, artifactNames[0]),
      serializeRelationalConfirmationJson(report),
      "utf8",
    ),
    writeFile(
      resolve(directory, artifactNames[1]),
      serializeConfirmationTrajectoriesCsv(report),
      "utf8",
    ),
    writeFile(
      resolve(directory, artifactNames[2]),
      serializeConfirmationSurvivalCsv(report),
      "utf8",
    ),
    writeFile(
      resolve(directory, artifactNames[3]),
      serializeRelationalConfirmationMarkdown(report),
      "utf8",
    ),
  ]);
  return {
    determinismDigest: report.determinismDigest,
    runCount: report.runCount,
    roundCount: report.roundCount,
  };
}

async function filesAreByteIdentical(leftPath: string, rightPath: string): Promise<boolean> {
  const [left, right] = await Promise.all([open(leftPath, "r"), open(rightPath, "r")]);
  try {
    const [leftStat, rightStat] = await Promise.all([left.stat(), right.stat()]);
    if (leftStat.size !== rightStat.size) return false;
    const leftBuffer = Buffer.allocUnsafe(64 * 1024);
    const rightBuffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < leftStat.size) {
      const length = Math.min(leftBuffer.length, leftStat.size - position);
      const [leftRead, rightRead] = await Promise.all([
        left.read(leftBuffer, 0, length, position),
        right.read(rightBuffer, 0, length, position),
      ]);
      if (leftRead.bytesRead !== rightRead.bytesRead
        || !leftBuffer.subarray(0, leftRead.bytesRead)
          .equals(rightBuffer.subarray(0, rightRead.bytesRead))) {
        return false;
      }
      position += leftRead.bytesRead;
    }
    return true;
  } finally {
    await Promise.all([left.close(), right.close()]);
  }
}

const outputFlag = process.argv.indexOf("--output-dir");
const outputDirectory = outputFlag >= 0
  ? resolve(process.argv[outputFlag + 1] ?? "")
  : null;
if (outputFlag >= 0 && (process.argv[outputFlag + 1] ?? "").length === 0) {
  throw new Error("--output-dir requires a directory path");
}

const firstIsTemporary = outputDirectory === null;
const firstDirectory = outputDirectory
  ?? await mkdtemp(join(tmpdir(), "relational-confirmation-first-"));
const replayDirectory = process.argv.includes("--verify")
  ? await mkdtemp(join(tmpdir(), "relational-confirmation-replay-"))
  : null;

try {
  const first = await render(firstDirectory);
  if (replayDirectory !== null) {
    const replay = await render(replayDirectory);
    for (const artifactName of artifactNames) {
      if (!await filesAreByteIdentical(
        resolve(firstDirectory, artifactName),
        resolve(replayDirectory, artifactName),
      )) {
        throw new Error(`confirmation artifact is not byte-for-byte deterministic: ${artifactName}`);
      }
    }
    if (first.determinismDigest !== replay.determinismDigest) {
      throw new Error("confirmation report determinism digest changed on replay");
    }
  }

  if (process.argv.includes("--verify-findings")) {
    const committed = resolve(
      new URL("../docs/research/strategy-confirmation.md", import.meta.url).pathname,
    );
    if (!await filesAreByteIdentical(
      resolve(firstDirectory, "strategy-confirmation.md"),
      committed,
    )) {
      throw new Error("committed strategy confirmation does not match canonical output");
    }
  }

  if (!process.argv.includes("--verify") && outputDirectory === null) {
    process.stdout.write(await readFile(
      resolve(firstDirectory, "strategy-confirmation.md"),
      "utf8",
    ));
  }
  process.stderr.write(
    `relational confirmation ${first.determinismDigest} `
    + `(${first.runCount} runs, ${first.roundCount} rounds)\n`,
  );
} finally {
  if (firstIsTemporary) await rm(firstDirectory, { recursive: true, force: true });
  if (replayDirectory !== null) await rm(replayDirectory, { recursive: true, force: true });
}
