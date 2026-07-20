import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseReferenceSourceManifests } from "../src/reference/manifest-parser.js";
import { parseTabularReferenceAdapterConfig } from "../src/reference/importers/config-parser.js";
import { importReferenceSource } from "../src/reference/importers/import-reference-source.js";
import { serializeReferenceImportResult } from "../src/reference/importers/serialize.js";
import { createTabularReferenceSourceAdapter } from "../src/reference/importers/tabular-adapter.js";

function usage(): never {
  throw new Error(
    "usage: tsx scripts/import-reference-tabular.ts <adapter-config.json> <input.csv|json> <output.json>",
  );
}

const [configArgument, inputArgument, outputArgument] = process.argv.slice(2);
if (configArgument === undefined || inputArgument === undefined || outputArgument === undefined) {
  usage();
}

const configPath = resolve(configArgument);
const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const manifestPath = resolve("data/reference-sources.json");

const [configSource, inputSource, manifestSource] = await Promise.all([
  readFile(configPath, "utf8"),
  readFile(inputPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const config = parseTabularReferenceAdapterConfig(JSON.parse(configSource));
const manifests = parseReferenceSourceManifests(JSON.parse(manifestSource));
const manifest = manifests.find((item) => item.id === config.sourceId);
if (manifest === undefined) {
  throw new Error(`reference source manifest not found: ${config.sourceId}`);
}

const result = importReferenceSource(
  inputSource,
  createTabularReferenceSourceAdapter(config),
  manifest,
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serializeReferenceImportResult(result), "utf8");
process.stdout.write(`${JSON.stringify(result.summary)}\n`);
