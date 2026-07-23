import type { CatalogEntry } from "../../src/core/model.js";
import type { ProductCatalogs } from "../../src/product/types.js";
import type {
  RuntimeSyntaxProfile,
  SyntacticFunction,
  Upos,
  ValencyFrame,
} from "../../src/syntax/types.js";

export function entry(id: string, tone: 1 | 2 = 1): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [
      { tokens: ["zhuyin:ㄇ", "zhuyin:ㄚ", `tone:${tone}`] },
      { tokens: ["zhuyin:ㄅ", "zhuyin:ㄛ", "tone:2"] },
    ],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

export const PRACTICE = Array.from({ length: 8 }, (_, index) =>
  entry(`practice-${index + 1}`, index % 2 === 0 ? 1 : 2),
);
export const EVALUATION = Array.from({ length: 4 }, (_, index) =>
  entry(`evaluation-${index + 1}`, index % 2 === 0 ? 1 : 2),
);

function profile(
  candidate: CatalogEntry,
  upos: Upos,
  functions: readonly SyntacticFunction[],
  valencyFrames: readonly ValencyFrame[],
): RuntimeSyntaxProfile {
  return {
    id: `profile:${candidate.id}:${upos}`,
    entryId: candidate.id,
    upos,
    functions,
    valencyFrames,
    dependencyEvidence: {
      dependencyRelationCounts: {
        nsubj: 1,
        obj: 1,
        advmod: 1,
        amod: 1,
      },
      surfacePositionCounts: { initial: 1, medial: 1, final: 1 },
    },
    provenanceIds: ["test"],
  };
}

export const SYNTAX_PROFILES: readonly RuntimeSyntaxProfile[] =
  [...PRACTICE, ...EVALUATION].flatMap((candidate) => [
    profile(candidate, "PRON", ["subject", "object", "indirect-object"], ["avalent"]),
    profile(candidate, "NOUN", ["subject", "object", "oblique", "modifier"], ["avalent"]),
    profile(candidate, "VERB", ["predicate", "complement", "modifier", "adverbial"], [
      "intransitive",
      "transitive",
      "ditransitive",
      "ambitransitive",
      "clausal-complement",
      "open-clausal-complement",
      "serial-verb",
      "causative",
      "resultative",
    ]),
    profile(candidate, "ADJ", ["predicate", "modifier", "complement"], ["intransitive"]),
    profile(candidate, "ADV", ["adverbial", "modifier"], ["avalent"]),
  ]);

export const PRODUCT_CATALOGS: ProductCatalogs = {
  practice: PRACTICE,
  evaluation: EVALUATION,
  syntaxProfiles: SYNTAX_PROFILES,
};
