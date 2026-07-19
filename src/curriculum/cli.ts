import { readFile } from "node:fs/promises";
import { compileCatalog } from "../catalog/compile-catalog.js";
import { parseCsv } from "../catalog/csv.js";
import { createProvenanceRegistry } from "../catalog/provenance.js";
import {
  PHASE_4_CURRICULUM_POLICY,
  validateCurriculumPolicy,
} from "./policy.js";
import { createStandardSimulationScenarios } from "./scenarios.js";
import { runCurriculumSimulation } from "./simulator.js";
import { createCatalogSupportIndex } from "./support.js";

function readArgument(args: readonly string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

export async function createCurriculumSimulationOutput(
  args: readonly string[],
): Promise<unknown> {
  const seed = readArgument(args, "--seed", "phase-4");
  const rounds = Number.parseInt(readArgument(args, "--rounds", "12"), 10);
  if (!Number.isInteger(rounds) || rounds <= 0) {
    throw new Error("--rounds must be a positive integer");
  }
  validateCurriculumPolicy(PHASE_4_CURRICULUM_POLICY);

  const [source, provenanceSource] = await Promise.all([
    readFile(new URL("../../data/source/words.sample.csv", import.meta.url), "utf8"),
    readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
  ]);
  const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
  if (provenance.errors.length > 0) {
    throw new Error(provenance.errors.map((error) => error.message).join("\n"));
  }
  const catalog = compileCatalog(parseCsv(source).records, provenance.ids);
  if (catalog.errors.length > 0) {
    throw new Error(catalog.errors.map((error) => error.message).join("\n"));
  }

  const support = createCatalogSupportIndex(catalog.entries);
  const scenarios = createStandardSimulationScenarios(
    support,
    PHASE_4_CURRICULUM_POLICY,
    seed,
    rounds,
  );
  const reports = scenarios.map((scenario) => runCurriculumSimulation(
    support,
    PHASE_4_CURRICULUM_POLICY,
    scenario,
  ));
  const first = runCurriculumSimulation(
    support,
    PHASE_4_CURRICULUM_POLICY,
    scenarios[0]!,
  );
  const second = runCurriculumSimulation(
    support,
    PHASE_4_CURRICULUM_POLICY,
    scenarios[0]!,
  );

  return {
    policy: PHASE_4_CURRICULUM_POLICY,
    catalog: {
      entries: catalog.entries.length,
      supportedBindings: Object.keys(support.byToken).length,
    },
    reports,
    determinismCheck: {
      scenario: scenarios[0]!.name,
      identical: JSON.stringify(first) === JSON.stringify(second),
      digest: first.determinismDigest,
    },
  };
}

export async function runCurriculumCli(args: readonly string[]): Promise<void> {
  console.log(JSON.stringify(await createCurriculumSimulationOutput(args), null, 2));
}
