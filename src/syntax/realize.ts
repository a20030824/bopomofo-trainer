import type { CatalogEntry } from "../core/model.js";
import { sha256Canonical } from "../reference/importers/canonical-json.js";
import type { StructuralDerivationShape, StructuralLexicalSlot } from "./derive.js";
import type {
  SurfaceRealization,
  SurfaceToken,
  SyntaxProfile,
} from "./types.js";

export interface LexicalRealizationOptions {
  readonly entries: readonly CatalogEntry[];
  readonly profiles: readonly SyntaxProfile[];
  readonly seed?: string;
  readonly profileOffsetsBySlotId?: Readonly<Record<string, number>>;
  readonly punctuationToken?: string;
}

export interface LexicalProfileIndex {
  readonly profilesByUpos: Readonly<Record<string, readonly SyntaxProfile[]>>;
  readonly entriesById: ReadonlyMap<string, CatalogEntry>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildLexicalProfileIndex(
  entries: readonly CatalogEntry[],
  profiles: readonly SyntaxProfile[],
): LexicalProfileIndex {
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const grouped: Record<string, SyntaxProfile[]> = {};
  for (const profile of [...profiles].sort((left, right) => compareText(left.id, right.id))) {
    if (!entriesById.has(profile.entryId)) {
      throw new Error(`syntax profile references missing catalog entry ${profile.entryId}`);
    }
    (grouped[profile.upos] ??= []).push(profile);
  }
  return { profilesByUpos: grouped, entriesById };
}

function featureMatches(slot: StructuralLexicalSlot, profile: SyntaxProfile): boolean {
  for (const [feature, value] of Object.entries(slot.requiredFeatures)) {
    switch (feature) {
      case "upos":
        if (profile.upos !== value) return false;
        break;
      case "function":
        if (typeof value !== "string" || !profile.functions.includes(value as never)) return false;
        break;
      case "valency":
        if (typeof value !== "string" || !profile.valencyFrames.includes(value as never)) return false;
        break;
      case "dependencyRelation":
        if (typeof value !== "string"
          || (profile.dependencyEvidence.dependencyRelationCounts[value] ?? 0) <= 0) return false;
        break;
      case "surfacePosition":
        if (typeof value !== "string"
          || (profile.dependencyEvidence.surfacePositionCounts[value] ?? 0) <= 0) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

export function compatibleProfilesForSlot(
  slot: StructuralLexicalSlot,
  index: LexicalProfileIndex,
): readonly SyntaxProfile[] {
  const candidates = slot.allowedUpos.length === 0
    ? Object.values(index.profilesByUpos).flat()
    : slot.allowedUpos.flatMap((upos) => index.profilesByUpos[upos] ?? []);
  return candidates.filter((profile) =>
    slot.requiredFunctions.every((value) => profile.functions.includes(value))
    && (slot.requiredValencyFrames.length === 0
      || slot.requiredValencyFrames.some((value) => profile.valencyFrames.includes(value)))
    && featureMatches(slot, profile));
}

function seededOffset(seed: string, slotId: string, size: number): number {
  const digest = sha256Canonical({ seed, slotId });
  const prefix = digest.slice(0, 12);
  return Number.parseInt(prefix, 16) % size;
}

function normalizeOffset(value: number, size: number): number {
  if (!Number.isInteger(value)) throw new Error("profile offsets must be integers");
  return ((value % size) + size) % size;
}

export function realizeStructuralDerivation(
  shape: StructuralDerivationShape,
  options: LexicalRealizationOptions,
): SurfaceRealization | null {
  const index = buildLexicalProfileIndex(options.entries, options.profiles);
  const seed = options.seed ?? shape.id;
  const tokens: SurfaceToken[] = [];
  const entryIds: string[] = [];
  const syntaxProfileIds: string[] = [];
  for (const slot of shape.lexicalSlots) {
    const punctuationOnly = slot.allowedUpos.length === 1 && slot.allowedUpos[0] === "PUNCT";
    const compatible = compatibleProfilesForSlot(slot, index);
    if (compatible.length === 0 && punctuationOnly) {
      tokens.push({
        kind: "punctuation",
        value: options.punctuationToken ?? "。",
        entryId: null,
        syntaxProfileId: null,
      });
      continue;
    }
    if (compatible.length === 0) return null;
    const requested = options.profileOffsetsBySlotId?.[slot.id];
    const offset = requested === undefined
      ? seededOffset(seed, slot.id, compatible.length)
      : normalizeOffset(requested, compatible.length);
    const profile = compatible[offset];
    if (profile === undefined) throw new Error("compatible profile selection failed");
    const entry = index.entriesById.get(profile.entryId);
    if (entry === undefined) throw new Error(`missing catalog entry ${profile.entryId}`);
    entryIds.push(entry.id);
    syntaxProfileIds.push(profile.id);
    tokens.push({
      kind: "lexical-entry",
      value: entry.prompt.text,
      entryId: entry.id,
      syntaxProfileId: profile.id,
    });
  }
  const identity = {
    grammarVersion: shape.grammarVersion,
    derivationId: shape.id,
    productionRulePath: shape.productionRulePath,
    entryIds,
    syntaxProfileIds,
    tokens,
  };
  return {
    id: `surface-realization:${sha256Canonical(identity)}`,
    grammarVersion: shape.grammarVersion,
    derivationId: shape.id,
    productionRulePath: shape.productionRulePath,
    entryIds,
    syntaxProfileIds,
    tokens,
  };
}
