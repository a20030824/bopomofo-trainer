import { readFile } from "node:fs/promises";
import type { Exercise } from "../src/core/model.js";
import { aggregateMeasurements } from "../src/measurement/aggregate.js";
import { deriveMeasurementDecisions } from "../src/measurement/derive-observations.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../src/measurement/policy.js";
import type { InteractionTrace } from "../src/practice/interaction-session.js";

interface TraceExport {
  readonly exercise: Exercise;
  readonly traces: readonly InteractionTrace[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTraceExport(value: unknown): TraceExport {
  if (!isRecord(value) || !isRecord(value.exercise) || !Array.isArray(value.traces)) {
    throw new Error("expected a spike JSON export with exercise and traces fields");
  }

  const exercise = value.exercise;
  if (
    typeof exercise.id !== "string"
    || (exercise.mode !== "guided" && exercise.mode !== "recall")
    || typeof exercise.layoutId !== "string"
    || !Array.isArray(exercise.entries)
  ) {
    throw new Error("the exported exercise has an unsupported shape");
  }

  return value as unknown as TraceExport;
}

const inputPath = process.argv[2];
if (inputPath === undefined) {
  throw new Error("usage: npm run measurement:analyze -- path/to/bopomofo-spike.json");
}

const source = await readFile(inputPath, "utf8");
const exported = parseTraceExport(JSON.parse(source) as unknown);
const decisions = deriveMeasurementDecisions(
  exported.exercise,
  exported.traces,
  PHASE_3_MEASUREMENT_POLICY,
);
const summary = aggregateMeasurements(decisions, PHASE_3_MEASUREMENT_POLICY);

console.log(JSON.stringify({
  policy: PHASE_3_MEASUREMENT_POLICY,
  decisions,
  summary,
}, null, 2));
