import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compileCatalog } from "../src/catalog/compile-catalog.js";
import { parseCsv } from "../src/catalog/csv.js";
import { createProvenanceRegistry } from "../src/catalog/provenance.js";
import { sha256Canonical } from "../src/reference/importers/canonical-json.js";
import { buildSyntaxCoverageReport } from "../src/syntax/coverage.js";
import { countStructuralDerivationShapes } from "../src/syntax/count.js";
import { DEFAULT_DERIVATION_BOUNDS, FORMAL_GRAMMAR_VERSION } from "../src/syntax/features.js";
import { FORMAL_SYNTAX_FIXTURES, FORMAL_SYNTAX_RULES } from "../src/syntax/grammar.js";
import {
  projectSyntaxProfiles,
  type SyntaxEvidenceArtifact,
} from "../src/syntax/profile-projection.js";
import {
  DEFAULT_RESOLVED_CATALOG_SOURCE_PATHS,
  loadResolvedCatalogSource,
  type CatalogSourceLocation,
  type ResolvedCatalogSourcePaths,
} from "./load-resolved-catalog-source.js";

interface CommittedSyntaxEvidenceArtifact extends SyntaxEvidenceArtifact {
  readonly schemaVersion: string;
  readonly determinismDigest: string;
  readonly source?: { readonly sourceId?: string };
}

interface Options {
  verifyOnly: boolean;
  evidence: CatalogSourceLocation;
  provenance: CatalogSourceLocation;
  profilesOutput: CatalogSourceLocation;
  coverageOutput: CatalogSourceLocation;
  catalogSources: Partial<ResolvedCatalogSourcePaths>;
  expectedCatalogCount?: number;
  provenanceIds: string[];
}

const defaultOutputUrl = new URL("../data/grammar/", import.meta.url);
const defaults: Options = {
  verifyOnly: false,
  evidence: new URL(
    "../data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-syntax-evidence-v2.json",
    import.meta.url,
  ),
  provenance: new URL("../data/provenance.csv", import.meta.url),
  profilesOutput: new URL("formal-syntax-current-catalog-profiles.json", defaultOutputUrl),
  coverageOutput: new URL("formal-syntax-current-catalog-coverage.json", defaultOutputUrl),
  catalogSources: {},
  provenanceIds: [],
};

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function parseArguments(argumentsList: readonly string[]): Options {
  const options: Options = {
    ...defaults,
    catalogSources: {},
    provenanceIds: [],
  };
  const take = (index: number, option: string): string => {
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${option} requires a value`);
    }
    return value;
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    switch (argument) {
      case "--verify":
        options.verifyOnly = true;
        break;
      case "--evidence":
        options.evidence = take(index, argument);
        index += 1;
        break;
      case "--provenance":
        options.provenance = take(index, argument);
        index += 1;
        break;
      case "--profiles-output":
        options.profilesOutput = take(index, argument);
        index += 1;
        break;
      case "--coverage-output":
        options.coverageOutput = take(index, argument);
        index += 1;
        break;
      case "--words":
        options.catalogSources.words = take(index, argument);
        index += 1;
        break;
      case "--concised-projection":
        options.catalogSources.concised = take(index, argument);
        index += 1;
        break;
      case "--revised-projection":
        options.catalogSources.revised = take(index, argument);
        index += 1;
        break;
      case "--cedict-projection":
        options.catalogSources.cedict = take(index, argument);
        index += 1;
        break;
      case "--manual-overrides":
        options.catalogSources.manual = take(index, argument);
        index += 1;
        break;
      case "--expected-catalog-count":
        options.expectedCatalogCount = parsePositiveInteger(take(index, argument), argument);
        index += 1;
        break;
      case "--provenance-id":
        options.provenanceIds.push(take(index, argument));
        index += 1;
        break;
      default:
        throw new Error(`unknown formal syntax coverage argument: ${argument}`);
    }
  }
  return options;
}

async function ensureParent(location: CatalogSourceLocation): Promise<void> {
  if (location instanceof URL) {
    await mkdir(new URL(".", location), { recursive: true });
  } else {
    await mkdir(dirname(location), { recursive: true });
  }
}

const options = parseArguments(process.argv.slice(2));
const [resolvedSource, provenanceSource, evidenceSource] = await Promise.all([
  loadResolvedCatalogSource(options.catalogSources),
  readFile(options.provenance, "utf8"),
  readFile(options.evidence, "utf8"),
]);
const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
if (provenance.errors.length > 0) {
  throw new Error(provenance.errors.map((item) =>
    `provenance row ${item.rowNumber}: ${item.message}`).join("\n"));
}
const catalog = compileCatalog(resolvedSource.records, provenance.ids);
if (catalog.errors.length > 0) {
  throw new Error(catalog.errors.map((item) =>
    `catalog row ${item.rowNumber}: ${item.message}`).join("\n"));
}
if (options.expectedCatalogCount !== undefined
  && catalog.entries.length !== options.expectedCatalogCount) {
  throw new Error(
    `expected ${options.expectedCatalogCount} catalog entries, found ${catalog.entries.length}`,
  );
}
const evidence = JSON.parse(evidenceSource) as CommittedSyntaxEvidenceArtifact;
if (evidence.schemaVersion !== "ud-syntax-evidence-v2") {
  throw new Error(`expected committed UD syntax evidence v2, found ${evidence.schemaVersion}`);
}
const evidenceSourceId = evidence.source?.sourceId;
const provenanceIds = options.provenanceIds.length > 0
  ? [...new Set(options.provenanceIds)].sort()
  : [evidenceSourceId ?? "ud:syntax-evidence"];
if (provenanceIds.some((value) => value.length === 0)) {
  throw new Error("formal syntax provenance IDs must be non-empty");
}
const projection = projectSyntaxProfiles(catalog.entries, evidence, { provenanceIds });
const derivationShapeCount = countStructuralDerivationShapes({
  rootCategory: "Sentence",
  rules: FORMAL_SYNTAX_RULES,
  bounds: DEFAULT_DERIVATION_BOUNDS,
});
const coverage = buildSyntaxCoverageReport({
  entries: catalog.entries,
  profiles: projection.profiles,
  rules: FORMAL_SYNTAX_RULES,
  fixtures: FORMAL_SYNTAX_FIXTURES,
  derivationShapeCountByBound: [{
    bounds: DEFAULT_DERIVATION_BOUNDS,
    count: derivationShapeCount,
    complete: true,
  }],
});
const catalogDigest = sha256Canonical(catalog.entries);
const profileArtifact = {
  schemaVersion: "formal-syntax-profiles-v1",
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  catalogEntryCount: catalog.entries.length,
  catalogDigest,
  evidenceSchemaVersion: evidence.schemaVersion,
  evidenceDigest: evidence.determinismDigest,
  profileCount: projection.profiles.length,
  noUdEvidenceEntryCount: projection.noUdEvidenceEntryIds.length,
  noUdEvidenceEntryIds: projection.noUdEvidenceEntryIds,
  projectionDigest: projection.projectionDigest,
  profiles: projection.profiles,
};
const profileDigest = sha256Canonical(profileArtifact);
const coverageArtifact = {
  ...coverage,
  catalogDigest,
  profileProjectionDigest: projection.projectionDigest,
  profileArtifactDigest: profileDigest,
};
const profileText = `${JSON.stringify({ ...profileArtifact, determinismDigest: profileDigest })}\n`;
const coverageText = `${JSON.stringify(coverageArtifact)}\n`;

if (options.verifyOnly) {
  const [committedProfiles, committedCoverage] = await Promise.all([
    readFile(options.profilesOutput, "utf8"),
    readFile(options.coverageOutput, "utf8"),
  ]);
  if (committedProfiles !== profileText) {
    throw new Error("committed formal syntax profile artifact is stale; regenerate it with the same explicit inputs");
  }
  if (committedCoverage !== coverageText) {
    throw new Error("committed formal syntax coverage artifact is stale; regenerate it with the same explicit inputs");
  }
} else {
  await Promise.all([
    ensureParent(options.profilesOutput),
    ensureParent(options.coverageOutput),
  ]);
  await Promise.all([
    writeFile(options.profilesOutput, profileText),
    writeFile(options.coverageOutput, coverageText),
  ]);
}

console.log(JSON.stringify({
  mode: options.verifyOnly ? "verify" : "write",
  catalogEntryCount: catalog.entries.length,
  profileCount: projection.profiles.length,
  noUdEvidenceEntryCount: projection.noUdEvidenceEntryIds.length,
  unrealizableProfileCount: coverage.unrealizableProfileCount,
  derivationShapeCount,
  coverageDigest: coverage.determinismDigest,
  profileDigest,
  catalogSources: {
    ...DEFAULT_RESOLVED_CATALOG_SOURCE_PATHS,
    ...options.catalogSources,
  },
}));
