import { FORMAL_GRAMMAR_VERSION } from "./features.js";
import type {
  ProductionConstituent,
  ProductionFixture,
  ProductionRule,
  SyntaxCategory,
  SyntaxFeatureSet,
  Upos,
} from "./types.js";

interface Options {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly recursive?: boolean;
  readonly requiredFeatures?: SyntaxFeatureSet;
}

function constituent(
  key: string,
  category: SyntaxCategory,
  options: Options = {},
): ProductionConstituent {
  return {
    key,
    category,
    minimum: options.minimum ?? 1,
    maximum: options.maximum ?? 1,
    recursive: options.recursive ?? false,
    allowedUpos: [],
    requiredFunctions: [],
    requiredValencyFrames: [],
    requiredFeatures: options.requiredFeatures ?? {},
  };
}

function lexical(
  key: string,
  allowedUpos: readonly Upos[],
  requiredFeatures: SyntaxFeatureSet,
): ProductionConstituent {
  return {
    ...constituent(key, "Lexeme", { requiredFeatures }),
    allowedUpos,
  };
}

function production(
  id: string,
  output: SyntaxCategory,
  constituents: readonly ProductionConstituent[],
): ProductionRule {
  const variable = constituents.some((item) => item.minimum !== item.maximum);
  return {
    id,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output,
    constituents,
    surfaceOrders: [{ id: "canonical", constituentKeys: constituents.map((item) => item.key) }],
    constraints: [],
    positiveFixtureIds: variable
      ? [`${id}:minimum`, `${id}:maximum`]
      : [`${id}:minimum`],
    negativeFixtureIds: [`${id}:overflow`],
  };
}

function fixtures(rule: ProductionRule): readonly ProductionFixture[] {
  const order = rule.surfaceOrders[0];
  const first = rule.constituents[0];
  if (order === undefined || first === undefined) throw new Error(`invalid rule ${rule.id}`);
  const makeCounts = (maximum: boolean) => Object.fromEntries(rule.constituents.map((item) => [
    item.key,
    maximum ? item.maximum : item.minimum,
  ]));
  const result: ProductionFixture[] = [{
    id: `${rule.id}:minimum`,
    ruleId: rule.id,
    expected: "accept",
    surfaceOrderId: order.id,
    constituentCounts: makeCounts(false),
  }];
  if (rule.positiveFixtureIds.includes(`${rule.id}:maximum`)) {
    result.push({
      id: `${rule.id}:maximum`,
      ruleId: rule.id,
      expected: "accept",
      surfaceOrderId: order.id,
      constituentCounts: makeCounts(true),
    });
  }
  result.push({
    id: `${rule.id}:overflow`,
    ruleId: rule.id,
    expected: "reject",
    surfaceOrderId: order.id,
    constituentCounts: { ...makeCounts(false), [first.key]: first.maximum + 1 },
  });
  return result;
}

function paired(
  id: string,
  coordinationType: string,
  markerUpos: readonly Upos[] = ["CCONJ", "SCONJ", "PART"],
): ProductionRule {
  return production(id, "ClauseSequence", [
    constituent("firstClause", "Clause", {
      recursive: true,
      requiredFeatures: { coordinationType },
    }),
    lexical("connector", markerUpos, { coordinationType }),
    constituent("secondClause", "Clause", {
      recursive: true,
      requiredFeatures: { coordinationType },
    }),
  ]);
}

export const COMPLEX_PRODUCTION_RULES: readonly ProductionRule[] = [
  paired("complex.coordination", "coordination"),
  paired("complex.additive", "additive"),
  paired("complex.alternative", "alternative"),
  paired("complex.cause-result", "cause-result", ["SCONJ", "CCONJ", "PART"]),
  paired("complex.condition", "condition", ["SCONJ", "PART"]),
  paired("complex.hypothetical", "hypothetical", ["SCONJ", "PART"]),
  paired("complex.concessive", "concessive", ["SCONJ", "CCONJ", "PART"]),
  paired("complex.contrast", "contrast", ["CCONJ", "SCONJ", "PART"]),
  paired("complex.purpose", "purpose", ["SCONJ", "ADP", "PART"]),
  paired("complex.temporal-sequence", "temporal-sequence", ["SCONJ", "ADV", "PART"]),
  production("complex.bounded-clause-sequence", "ClauseSequence", [
    constituent("clause", "Clause", {
      minimum: 2,
      maximum: 4,
      recursive: true,
      requiredFeatures: { clauseType: "sequence" },
    }),
  ]),
  production("sentence.complex", "Sentence", [
    constituent("sequence", "ClauseSequence", {
      recursive: true,
      requiredFeatures: { clauseType: "complex" },
    }),
    constituent("punctuation", "Punctuation", { minimum: 0, maximum: 1 }),
  ]),
  production("phrase.noun.multi-relative", "NounPhrase", [
    constituent("relative", "RelativeClause", {
      minimum: 1,
      maximum: 3,
      recursive: true,
      requiredFeatures: { clauseType: "relative" },
    }),
    constituent("head", "NominalHead"),
  ]),
];

export const COMPLEX_PRODUCTION_FIXTURES: readonly ProductionFixture[] =
  COMPLEX_PRODUCTION_RULES.flatMap(fixtures);
