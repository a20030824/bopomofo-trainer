import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compileCatalog } from "../src/catalog/compile-catalog.js";
import { parseCsv } from "../src/catalog/csv.js";
import { createProvenanceRegistry } from "../src/catalog/provenance.js";
import { sha256Canonical } from "../src/reference/importers/canonical-json.js";
import type {
  CatalogPackagingExclusionStatus,
  CatalogSyntaxLegalityArtifact,
} from "../src/syntax/catalog-legality.js";
import { FORMAL_GRAMMAR_VERSION } from "../src/syntax/features.js";
import type {
  ActiveCatalogSyntaxProfilesArtifact,
} from "../src/syntax/runtime-profiles.js";
import type { SyntaxRuleIndexStatus } from "../src/syntax/rule-index.js";
import type { RuntimeSyntaxProfile, SyntaxProfile } from "../src/syntax/types.js";
import { loadResolvedCatalogSource } from "./load-resolved-catalog-source.js";

interface SourceRuleIndex {
  readonly schemaVersion: string;
  readonly grammarVersion: string;
  readonly selectionDigest: string;
  readonly evidenceDigest: string;
  readonly profileProjectionDigest: string;
  readonly profileArtifactDigest: string;
  readonly determinismDigest: string;
  readonly entries: readonly {
    readonly entryId: string;
    readonly text: string;
    readonly status: SyntaxRuleIndexStatus;
    readonly profileIds: readonly string[];
  }[];
}

interface SourceProfilesArtifact {
  readonly schemaVersion: string;
  readonly grammarVersion: string;
  readonly candidateCount: number;
  readonly selectionDigest: string;
  readonly evidenceDigest: string;
  readonly profileCount: number;
  readonly projectionDigest: string;
  readonly profiles: readonly SyntaxProfile[];
  readonly determinismDigest: string;
}

interface Options {
  readonly ruleIndex: string;
  readonly profiles: string;
  readonly output: string;
  readonly profilesOutput: string;
}

function parseArguments(values: readonly string[]): Options {
  let ruleIndex = "data/generated/lexicon/naer-1141208-top-10000/syntax-rule-index.json";
  let profiles = "data/generated/lexicon/naer-1141208-top-10000/syntax-profiles.json";
  let output = "data/grammar/formal-syntax-active-catalog-legality.json";
  let profilesOutput = "data/grammar/formal-syntax-active-catalog-profiles.json";
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    const value = values[index + 1];
    if ((option !== "--rule-index"
      && option !== "--profiles"
      && option !== "--output"
      && option !== "--profiles-output")
      || value === undefined || value.startsWith("--")) {
      throw new Error(`invalid app syntax legality argument: ${option}`);
    }
    if (option === "--rule-index") ruleIndex = value;
    else if (option === "--profiles") profiles = value;
    else if (option === "--output") output = value;
    else profilesOutput = value;
    index += 1;
  }
  return { ruleIndex, profiles, output, profilesOutput };
}

const options = parseArguments(process.argv.slice(2));
const [resolved, provenanceSource, ruleIndexSource, profilesSource] = await Promise.all([
  loadResolvedCatalogSource(),
  readFile(new URL("../data/provenance.csv", import.meta.url), "utf8"),
  readFile(options.ruleIndex, "utf8"),
  readFile(options.profiles, "utf8"),
]);
const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
if (provenance.errors.length > 0) {
  throw new Error(provenance.errors.map((item) => item.message).join("\n"));
}
const catalog = compileCatalog(resolved.records, provenance.ids);
if (catalog.errors.length > 0) {
  throw new Error(catalog.errors.map((item) => item.message).join("\n"));
}
const source = JSON.parse(ruleIndexSource) as SourceRuleIndex;
const sourceProfiles = JSON.parse(profilesSource) as SourceProfilesArtifact;
if (source.schemaVersion !== "formal-syntax-rule-index-v1"
  || source.grammarVersion !== FORMAL_GRAMMAR_VERSION
  || !source.selectionDigest
  || !source.evidenceDigest
  || !source.profileProjectionDigest
  || !source.profileArtifactDigest
  || !source.determinismDigest) {
  throw new Error("source rule index is missing formal generation lineage");
}
if (sourceProfiles.schemaVersion !== "formal-syntax-lexicon-profiles-v1"
  || sourceProfiles.grammarVersion !== FORMAL_GRAMMAR_VERSION
  || sourceProfiles.candidateCount !== source.entries.length
  || sourceProfiles.profileCount !== sourceProfiles.profiles.length
  || sourceProfiles.selectionDigest !== source.selectionDigest
  || sourceProfiles.evidenceDigest !== source.evidenceDigest
  || sourceProfiles.projectionDigest !== source.profileProjectionDigest
  || sourceProfiles.determinismDigest !== source.profileArtifactDigest) {
  throw new Error("source profiles do not match the formal rule index lineage");
}
const byText = new Map(source.entries.map((entry) => [entry.text, entry]));
if (byText.size !== source.entries.length) {
  throw new Error("source rule index contains duplicate written forms");
}
const legalEntryIds: string[] = [];
const runtimeProfiles: RuntimeSyntaxProfile[] = [];
const sourceProfilesById = new Map(sourceProfiles.profiles.map((profile) => [profile.id, profile]));
const exclusions: Array<{
  entryId: string;
  text: string;
  status: CatalogPackagingExclusionStatus;
}> = [];
for (const entry of catalog.entries) {
  const indexed = byText.get(entry.prompt.text);
  if (indexed?.status === "indexed") {
    if (indexed.profileIds.length === 0) {
      throw new Error(`indexed source entry has no syntax profiles: ${entry.prompt.text}`);
    }
    legalEntryIds.push(entry.id);
    for (const sourceProfileId of indexed.profileIds) {
      const sourceProfile = sourceProfilesById.get(sourceProfileId);
      if (sourceProfile === undefined || sourceProfile.entryId !== indexed.entryId) {
        throw new Error(`source rule index references an invalid syntax profile: ${sourceProfileId}`);
      }
      runtimeProfiles.push({
        id: `runtime-syntax-profile:${sha256Canonical({
          sourceProfileId,
          catalogEntryId: entry.id,
        })}`,
        entryId: entry.id,
        upos: sourceProfile.upos,
        functions: sourceProfile.functions,
        valencyFrames: sourceProfile.valencyFrames,
        dependencyEvidence: {
          dependencyRelationCounts: sourceProfile.dependencyEvidence.dependencyRelationCounts,
          surfacePositionCounts: sourceProfile.dependencyEvidence.surfacePositionCounts,
        },
        provenanceIds: sourceProfile.provenanceIds,
      });
    }
  } else exclusions.push({
    entryId: entry.id,
    text: entry.prompt.text,
    status: indexed?.status ?? "not-in-generation",
  });
}
legalEntryIds.sort();
exclusions.sort((left, right) => left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0);
runtimeProfiles.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
const core = {
  schemaVersion: "formal-syntax-catalog-legality-v1" as const,
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  catalogEntryCount: catalog.entries.length,
  catalogDigest: sha256Canonical(catalog.entries),
  sourceSelectionDigest: source.selectionDigest,
  sourceEvidenceDigest: source.evidenceDigest,
  sourceProfileProjectionDigest: source.profileProjectionDigest,
  sourceRuleIndexDigest: source.determinismDigest,
  legalEntryCount: legalEntryIds.length,
  exclusionCount: exclusions.length,
  legalEntryIds,
  exclusions,
};
const artifact: CatalogSyntaxLegalityArtifact = {
  ...core,
  determinismDigest: sha256Canonical(core),
};
const profilesCore = {
  schemaVersion: "formal-syntax-active-catalog-profiles-v1" as const,
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  catalogEntryCount: catalog.entries.length,
  catalogDigest: sha256Canonical(catalog.entries),
  sourceSelectionDigest: source.selectionDigest,
  sourceEvidenceDigest: source.evidenceDigest,
  sourceProfileProjectionDigest: source.profileProjectionDigest,
  sourceProfileArtifactDigest: source.profileArtifactDigest,
  sourceRuleIndexDigest: source.determinismDigest,
  profileCount: runtimeProfiles.length,
  profiles: runtimeProfiles,
};
const profilesArtifact: ActiveCatalogSyntaxProfilesArtifact = {
  ...profilesCore,
  determinismDigest: sha256Canonical(profilesCore),
};
await Promise.all([
  mkdir(dirname(options.output), { recursive: true }),
  mkdir(dirname(options.profilesOutput), { recursive: true }),
]);
await Promise.all([
  writeFile(options.output, `${JSON.stringify(artifact)}\n`, "utf8"),
  writeFile(options.profilesOutput, `${JSON.stringify(profilesArtifact)}\n`, "utf8"),
]);
console.log(JSON.stringify({
  catalogEntryCount: artifact.catalogEntryCount,
  legalEntryCount: artifact.legalEntryCount,
  exclusionCount: artifact.exclusionCount,
  runtimeProfileCount: profilesArtifact.profileCount,
  sourceRuleIndexDigest: artifact.sourceRuleIndexDigest,
  determinismDigest: artifact.determinismDigest,
}));
