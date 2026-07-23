import { mkdir, readFile, writeFile } from "node:fs/promises";
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
import { loadResolvedCatalogSource } from "./load-resolved-catalog-source.js";

interface CommittedSyntaxEvidenceArtifact extends SyntaxEvidenceArtifact {
  readonly schemaVersion: string;
  readonly determinismDigest: string;
}

const provenanceUrl = new URL("../data/provenance.csv", import.meta.url);
const evidenceUrl = new URL(
  "../data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-syntax-evidence-v2.json",
  import.meta.url,
);
const outputUrl = new URL("../data/grammar/", import.meta.url);
const profilesUrl = new URL("formal-syntax-current-catalog-profiles.json", outputUrl);
const coverageUrl = new URL("formal-syntax-current-catalog-coverage.json", outputUrl);
const argumentsList = process.argv.slice(2);
if (argumentsList.some((argument) => argument !== "--verify")) {
  throw new Error(`unknown formal syntax coverage argument: ${argumentsList.join(" ")}`);
}
const verifyOnly = argumentsList.includes("--verify");

const [resolvedSource, provenanceSource, evidenceSource] = await Promise.all([
  loadResolvedCatalogSource(),
  readFile(provenanceUrl, "utf8"),
  readFile(evidenceUrl, "utf8"),
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
if (catalog.entries.length !== 322) {
  throw new Error(`expected 322 catalog entries, found ${catalog.entries.length}`);
}
const evidence = JSON.parse(evidenceSource) as CommittedSyntaxEvidenceArtifact;
if (evidence.schemaVersion !== "ud-syntax-evidence-v2") {
  throw new Error(`expected committed UD syntax evidence v2, found ${evidence.schemaVersion}`);
}
const projection = projectSyntaxProfiles(catalog.entries, evidence, {
  provenanceIds: ["ud:chinese-gsd-r2.18"],
});
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

if (verifyOnly) {
  const [committedProfiles, committedCoverage] = await Promise.all([
    readFile(profilesUrl, "utf8"),
    readFile(coverageUrl, "utf8"),
  ]);
  if (committedProfiles !== profileText) {
    throw new Error("committed formal syntax profile artifact is stale; run npm run grammar:formal-syntax-coverage");
  }
  if (committedCoverage !== coverageText) {
    throw new Error("committed formal syntax coverage artifact is stale; run npm run grammar:formal-syntax-coverage");
  }
} else {
  await mkdir(outputUrl, { recursive: true });
  await Promise.all([
    writeFile(profilesUrl, profileText),
    writeFile(coverageUrl, coverageText),
  ]);
}

console.log(JSON.stringify({
  mode: verifyOnly ? "verify" : "write",
  catalogEntryCount: catalog.entries.length,
  profileCount: projection.profiles.length,
  noUdEvidenceEntryCount: projection.noUdEvidenceEntryIds.length,
  unrealizableProfileCount: coverage.unrealizableProfileCount,
  derivationShapeCount,
  coverageDigest: coverage.determinismDigest,
  profileDigest,
}));
