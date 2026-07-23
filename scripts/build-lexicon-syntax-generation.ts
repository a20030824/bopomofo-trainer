import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseCsv } from "../src/catalog/csv.js";
import { sha256Canonical } from "../src/reference/importers/canonical-json.js";
import { FORMAL_GRAMMAR_VERSION } from "../src/syntax/features.js";
import { FORMAL_SYNTAX_RULES } from "../src/syntax/grammar.js";
import {
  projectSyntaxProfilesForLexemes,
  type SyntaxEvidenceArtifact,
} from "../src/syntax/profile-projection.js";
import { buildSyntaxRuleIndex, type RankedSyntaxLexeme } from "../src/syntax/rule-index.js";

interface Options {
  candidates: string;
  candidateManifest: string;
  evidence: string;
  profilesOutput: string;
  ruleIndexOutput: string;
}

interface CandidateManifest {
  readonly adapterVersion?: string;
  readonly selection?: {
    readonly selectedCount?: number;
    readonly normalizedTextCount?: number;
    readonly limit?: number;
    readonly determinismDigest?: string;
  };
  readonly rows?: readonly {
    readonly generalRank?: number;
    readonly lexicalText?: string;
    readonly writtenPerMillion?: number | null;
    readonly spokenPerMillion?: number | null;
  }[];
}

interface GenerationEvidence extends SyntaxEvidenceArtifact {
  readonly schemaVersion?: string;
  readonly determinismDigest?: string;
  readonly candidateCount?: number;
  readonly candidateSource?: {
    readonly canonicalChecksumSha256?: string;
    readonly manifestLineage?: {
      readonly candidateChecksumSha256?: string;
      readonly candidateCount?: number;
      readonly sourceRankLimit?: number;
      readonly selectionDigest?: string;
      readonly manifestChecksumSha256?: string;
      readonly manifestAdapterVersion?: string;
    };
  };
}

interface CandidateRecord extends RankedSyntaxLexeme {
  readonly writtenPerMillion: number | null;
  readonly spokenPerMillion: number | null;
}

const SUPPORTED_MANIFEST_ADAPTERS = new Set([
  "naer-lexicon-candidates-adapter-v1",
  "naer-lexicon-candidates-adapter-v2",
]);

function parseArguments(values: readonly string[]): Options {
  const result: Partial<Options> = {};
  const take = (index: number, option: string): string => {
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
    return value;
  };
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    switch (option) {
      case "--candidates":
        result.candidates = take(index, option);
        index += 1;
        break;
      case "--candidate-manifest":
        result.candidateManifest = take(index, option);
        index += 1;
        break;
      case "--evidence":
        result.evidence = take(index, option);
        index += 1;
        break;
      case "--profiles-output":
        result.profilesOutput = take(index, option);
        index += 1;
        break;
      case "--rule-index-output":
        result.ruleIndexOutput = take(index, option);
        index += 1;
        break;
      default:
        throw new Error(`unknown lexicon syntax generation argument: ${option}`);
    }
  }
  const missing = [
    "candidates", "candidateManifest", "evidence", "profilesOutput", "ruleIndexOutput",
  ].filter((key) => result[key as keyof Options] === undefined);
  if (missing.length > 0) throw new Error(`missing required arguments: ${missing.join(", ")}`);
  return result as Options;
}

function parseOptionalNumber(value: string, label: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be finite or blank`);
  return parsed;
}

function loadCandidates(source: string): readonly CandidateRecord[] {
  const parsed = parseCsv(source.replace(/^\uFEFF/u, ""));
  for (const header of ["text", "naer_general_rank"]) {
    if (!parsed.headers.includes(header)) throw new Error(`candidate CSV is missing ${header}`);
  }
  const rows = parsed.records
    .filter((record) => record.values.status !== "excluded")
    .map((record): CandidateRecord => {
      const text = record.values.text ?? "";
      const generalRank = Number(record.values.naer_general_rank);
      if (!text || !Number.isInteger(generalRank) || generalRank <= 0) {
        throw new Error(`invalid candidate at CSV row ${record.rowNumber}`);
      }
      return {
        id: `lexicon-candidate:${generalRank}`,
        text,
        generalRank,
        writtenPerMillion: parseOptionalNumber(
          record.values.written_per_million ?? "",
          `candidate row ${record.rowNumber} written_per_million`,
        ),
        spokenPerMillion: parseOptionalNumber(
          record.values.spoken_per_million ?? "",
          `candidate row ${record.rowNumber} spoken_per_million`,
        ),
      };
    })
    .sort((left, right) => left.generalRank - right.generalRank);
  if (rows.length === 0) throw new Error("candidate CSV has no eligible rows");
  if (new Set(rows.map((row) => row.text)).size !== rows.length) {
    throw new Error("candidate CSV contains duplicate text");
  }
  if (new Set(rows.map((row) => row.generalRank)).size !== rows.length) {
    throw new Error("candidate CSV contains duplicate ranks");
  }
  return rows;
}

function selectionDigest(rows: readonly CandidateRecord[]): string {
  return sha256Canonical(rows.map((row) => ({
    generalRank: row.generalRank,
    lexicalText: row.text,
    spokenPerMillion: row.spokenPerMillion,
    writtenPerMillion: row.writtenPerMillion,
  })));
}

function sha256Text(source: string): string {
  return createHash("sha256").update(source.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

function validateManifest(
  candidates: readonly CandidateRecord[],
  manifest: CandidateManifest,
): { readonly selectionDigest: string; readonly sourceRankLimit: number } {
  if (!SUPPORTED_MANIFEST_ADAPTERS.has(manifest.adapterVersion ?? "")) {
    throw new Error(`unsupported candidate manifest adapter: ${manifest.adapterVersion}`);
  }
  if (manifest.selection?.selectedCount !== candidates.length
    || manifest.selection.normalizedTextCount !== candidates.length) {
    throw new Error("candidate manifest count does not match CSV");
  }
  const sourceRankLimit = manifest.selection.limit;
  if (!Number.isInteger(sourceRankLimit) || sourceRankLimit === undefined || sourceRankLimit <= 0) {
    throw new Error("candidate manifest limit must be a positive integer");
  }
  const digest = selectionDigest(candidates);
  if (manifest.selection.determinismDigest !== digest) {
    throw new Error("candidate manifest selection digest does not match CSV");
  }
  const normalizedManifestRows = (manifest.rows ?? []).map((row) => ({
    generalRank: row.generalRank,
    lexicalText: row.lexicalText,
    writtenPerMillion: row.writtenPerMillion ?? null,
    spokenPerMillion: row.spokenPerMillion ?? null,
  }));
  const expectedRows = candidates.map((row) => ({
    generalRank: row.generalRank,
    lexicalText: row.text,
    writtenPerMillion: row.writtenPerMillion,
    spokenPerMillion: row.spokenPerMillion,
  }));
  if (JSON.stringify(normalizedManifestRows) !== JSON.stringify(expectedRows)) {
    throw new Error("candidate manifest rows do not exactly match CSV");
  }
  return { selectionDigest: digest, sourceRankLimit };
}

function validateEvidence(
  candidates: readonly CandidateRecord[],
  evidence: GenerationEvidence,
  lineage: {
    readonly selectionDigest: string;
    readonly sourceRankLimit: number;
    readonly candidateChecksum: string;
    readonly manifestChecksum: string;
    readonly manifestAdapterVersion: string;
  },
): void {
  if (evidence.schemaVersion !== "ud-syntax-evidence-v2") {
    throw new Error(`expected UD syntax evidence v2, found ${evidence.schemaVersion}`);
  }
  if (evidence.candidateCount !== candidates.length || evidence.rows.length !== candidates.length) {
    throw new Error("UD evidence candidate count does not match generation");
  }
  const evidenceRows = [...evidence.rows].sort((left, right) =>
    ((left as { generalRank?: number }).generalRank ?? 0)
      - ((right as { generalRank?: number }).generalRank ?? 0)
  );
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const row = evidenceRows[index] as typeof evidenceRows[number] & { generalRank?: number };
    if (row.generalRank !== candidate.generalRank || row.text !== candidate.text) {
      throw new Error(`UD evidence row ${index + 1} does not match candidate generation`);
    }
  }
  const source = evidence.candidateSource;
  const embedded = source?.manifestLineage;
  if (source?.canonicalChecksumSha256 !== lineage.candidateChecksum
    || embedded?.candidateChecksumSha256 !== lineage.candidateChecksum
    || embedded.candidateCount !== candidates.length
    || embedded.sourceRankLimit !== lineage.sourceRankLimit
    || embedded.selectionDigest !== lineage.selectionDigest
    || embedded.manifestChecksumSha256 !== lineage.manifestChecksum
    || embedded.manifestAdapterVersion !== lineage.manifestAdapterVersion) {
    throw new Error("UD evidence lineage does not match candidates and manifest");
  }
  if (!evidence.determinismDigest) throw new Error("UD evidence is missing its determinism digest");
}

const options = parseArguments(process.argv.slice(2));
const [candidateSource, manifestSource, evidenceSource] = await Promise.all([
  readFile(options.candidates, "utf8"),
  readFile(options.candidateManifest, "utf8"),
  readFile(options.evidence, "utf8"),
]);
const candidates = loadCandidates(candidateSource);
const manifest = JSON.parse(manifestSource) as CandidateManifest;
const evidence = JSON.parse(evidenceSource) as GenerationEvidence;
const manifestLineage = validateManifest(candidates, manifest);
const lineage = {
  ...manifestLineage,
  candidateChecksum: sha256Text(candidateSource),
  manifestChecksum: createHash("sha256").update(manifestSource, "utf8").digest("hex"),
  manifestAdapterVersion: manifest.adapterVersion!,
};
validateEvidence(candidates, evidence, lineage);

const provenanceIds = [evidence.source?.sourceId ?? "ud:syntax-evidence"];
const projection = projectSyntaxProfilesForLexemes(candidates, evidence, { provenanceIds });
const profilesCore = {
  schemaVersion: "formal-syntax-lexicon-profiles-v1" as const,
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  candidateCount: candidates.length,
  selectionDigest: lineage.selectionDigest,
  candidateChecksumSha256: lineage.candidateChecksum,
  manifestChecksumSha256: lineage.manifestChecksum,
  evidenceDigest: evidence.determinismDigest!,
  profileCount: projection.profiles.length,
  noUdEvidenceCandidateCount: projection.noUdEvidenceEntryIds.length,
  noUdEvidenceEntryIds: projection.noUdEvidenceEntryIds,
  projectionDigest: projection.projectionDigest,
  profiles: projection.profiles,
};
const profilesDigest = sha256Canonical(profilesCore);
const index = buildSyntaxRuleIndex({
  lexemes: candidates,
  profiles: projection.profiles,
  rules: FORMAL_SYNTAX_RULES,
});
const { determinismDigest: reachabilityDigest, ...indexWithoutDigest } = index;
const indexCore = {
  ...indexWithoutDigest,
  reachabilityDigest,
  selectionDigest: lineage.selectionDigest,
  candidateChecksumSha256: lineage.candidateChecksum,
  manifestChecksumSha256: lineage.manifestChecksum,
  evidenceDigest: evidence.determinismDigest!,
  profileProjectionDigest: projection.projectionDigest,
  profileArtifactDigest: profilesDigest,
};
const indexDigest = sha256Canonical(indexCore);

await Promise.all([
  mkdir(dirname(options.profilesOutput), { recursive: true }),
  mkdir(dirname(options.ruleIndexOutput), { recursive: true }),
]);
await Promise.all([
  writeFile(
    options.profilesOutput,
    `${JSON.stringify({ ...profilesCore, determinismDigest: profilesDigest })}\n`,
  ),
  writeFile(
    options.ruleIndexOutput,
    `${JSON.stringify({ ...indexCore, determinismDigest: indexDigest })}\n`,
  ),
]);

console.log(JSON.stringify({
  candidateCount: candidates.length,
  profileCount: projection.profiles.length,
  noUdEvidenceCandidateCount: projection.noUdEvidenceEntryIds.length,
  indexedCandidateCount: index.indexedCandidateCount,
  noCompatibleRulePositionCandidateCount: index.noCompatibleRulePositionCandidateCount,
  noReachableSentenceRuleCandidateCount: index.noReachableSentenceRuleCandidateCount,
  globallyRealizableRuleCount: index.globallyRealizableRuleCount,
  profileDigest: profilesDigest,
  ruleIndexDigest: indexDigest,
}));
