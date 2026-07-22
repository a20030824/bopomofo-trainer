import {
  FORMAL_GRAMMAR_VERSION,
} from "./features.js";
import type {
  ProductionConstituent,
  ProductionFixture,
  ProductionRule,
  SyntacticFunction,
  SyntaxCategory,
  SyntaxFeatureSet,
  Upos,
  ValencyFrame,
} from "./types.js";
import { assertValidGrammarBundle } from "./validate.js";

interface ConstituentOptions {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly recursive?: boolean;
  readonly allowedUpos?: readonly Upos[];
  readonly requiredFunctions?: readonly SyntacticFunction[];
  readonly requiredValencyFrames?: readonly ValencyFrame[];
  readonly requiredFeatures?: SyntaxFeatureSet;
}

function constituent(
  key: string,
  category: SyntaxCategory,
  options: ConstituentOptions = {},
): ProductionConstituent {
  return {
    key,
    category,
    minimum: options.minimum ?? 1,
    maximum: options.maximum ?? 1,
    recursive: options.recursive ?? false,
    allowedUpos: options.allowedUpos ?? [],
    requiredFunctions: options.requiredFunctions ?? [],
    requiredValencyFrames: options.requiredValencyFrames ?? [],
    requiredFeatures: options.requiredFeatures ?? {},
  };
}

function lexical(
  key: string,
  allowedUpos: readonly Upos[],
  options: Omit<ConstituentOptions, "allowedUpos"> = {},
): ProductionConstituent {
  return constituent(key, "Lexeme", { ...options, allowedUpos });
}

function production(
  id: string,
  output: SyntaxCategory,
  constituents: readonly ProductionConstituent[],
  surfaceOrders: readonly { readonly id: string; readonly constituentKeys: readonly string[] }[] = [{
    id: "canonical",
    constituentKeys: constituents.map((item) => item.key),
  }],
): ProductionRule {
  const hasVariableCardinality = constituents.some(
    (item) => item.minimum !== item.maximum,
  );
  return {
    id,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output,
    constituents,
    surfaceOrders,
    constraints: [],
    positiveFixtureIds: hasVariableCardinality
      ? [`${id}:minimum`, `${id}:maximum`]
      : [`${id}:minimum`],
    negativeFixtureIds: [`${id}:overflow`],
  };
}

function countsFor(
  rule: ProductionRule,
  selection: "minimum" | "maximum",
): Readonly<Record<string, number>> {
  return Object.fromEntries(rule.constituents.map((item) => [
    item.key,
    selection === "minimum" ? item.minimum : item.maximum,
  ]));
}

function fixturesForRule(rule: ProductionRule): readonly ProductionFixture[] {
  const order = rule.surfaceOrders[0];
  const first = rule.constituents[0];
  if (order === undefined || first === undefined) {
    throw new Error(`formal production ${rule.id} requires an order and constituent`);
  }
  const fixtures: ProductionFixture[] = [{
    id: `${rule.id}:minimum`,
    ruleId: rule.id,
    expected: "accept",
    surfaceOrderId: order.id,
    constituentCounts: countsFor(rule, "minimum"),
  }];
  if (rule.positiveFixtureIds.includes(`${rule.id}:maximum`)) {
    fixtures.push({
      id: `${rule.id}:maximum`,
      ruleId: rule.id,
      expected: "accept",
      surfaceOrderId: order.id,
      constituentCounts: countsFor(rule, "maximum"),
    });
  }
  fixtures.push({
    id: `${rule.id}:overflow`,
    ruleId: rule.id,
    expected: "reject",
    surfaceOrderId: order.id,
    constituentCounts: {
      ...countsFor(rule, "minimum"),
      [first.key]: first.maximum + 1,
    },
  });
  return fixtures;
}

function coordinationRule(
  id: string,
  category: SyntaxCategory,
): ProductionRule {
  return production(id, category, [
    constituent("left", category, { recursive: true }),
    lexical("connector", ["CCONJ"], { requiredFunctions: ["coordinator"] }),
    constituent("right", category, { recursive: true }),
  ]);
}

export const PHRASE_PRODUCTION_RULES: readonly ProductionRule[] = [
  production("phrase.nominal-head.noun", "NominalHead", [
    lexical("head", ["NOUN"]),
  ]),
  production("phrase.nominal-head.pronoun", "NominalHead", [
    lexical("head", ["PRON"]),
  ]),
  production("phrase.nominal-head.proper", "NominalHead", [
    lexical("head", ["PROPN"]),
  ]),
  production("phrase.noun.bare", "NounPhrase", [
    constituent("head", "NominalHead"),
  ]),
  production("phrase.noun.expanded", "NounPhrase", [
    constituent("determiner", "DeterminerPhrase", { minimum: 0, maximum: 1 }),
    constituent("numeral", "NumeralPhrase", { minimum: 0, maximum: 1 }),
    constituent("modifier", "AdjectivePhrase", { minimum: 0, maximum: 3 }),
    constituent("head", "NominalHead"),
  ]),
  production("phrase.determiner.lexical", "DeterminerPhrase", [
    lexical("head", ["DET"], { requiredFunctions: ["determiner"] }),
  ]),
  production("phrase.numeral.lexical", "NumeralPhrase", [
    lexical("number", ["NUM"], { requiredFunctions: ["numeral"] }),
  ]),
  production("phrase.numeral.classifier", "NumeralPhrase", [
    lexical("number", ["NUM"], { requiredFunctions: ["numeral"] }),
    lexical("classifier", ["PART"], { requiredFunctions: ["classifier"] }),
  ]),
  production("phrase.adjective.lexical", "AdjectivePhrase", [
    lexical("head", ["ADJ"]),
  ]),
  production("phrase.adjective.modified", "AdjectivePhrase", [
    constituent("degree", "AdverbPhrase", { minimum: 0, maximum: 1 }),
    constituent("negation", "AdverbPhrase", {
      minimum: 0,
      maximum: 1,
      requiredFeatures: { polarity: "negative" },
    }),
    lexical("head", ["ADJ"]),
    constituent("complement", "Complement", { minimum: 0, maximum: 1 }),
  ]),
  production("phrase.adverb.lexical", "AdverbPhrase", [
    lexical("head", ["ADV"]),
  ]),
  production("phrase.adverb.degree", "AdverbPhrase", [
    lexical("degree", ["ADV"], { requiredFunctions: ["modifier"] }),
    lexical("head", ["ADV"]),
  ]),
  production("phrase.adposition.preposed", "AdpositionPhrase", [
    lexical("head", ["ADP"], { requiredFunctions: ["adposition"] }),
    constituent("object", "NounPhrase"),
  ]),
  production("phrase.adposition.postposed", "AdpositionPhrase", [
    constituent("object", "NounPhrase"),
    lexical("head", ["PART"], { requiredFunctions: ["adposition"] }),
  ]),
  production("phrase.particle.lexical", "ParticlePhrase", [
    lexical("head", ["PART"]),
  ]),
  production("phrase.complementizer.lexical", "ComplementizerPhrase", [
    lexical("head", ["SCONJ"], { requiredFunctions: ["marker"] }),
  ]),
  production("phrase.verb.lexical", "VerbPhrase", [
    lexical("head", ["VERB"]),
  ]),
  production("phrase.verb.expanded", "VerbPhrase", [
    constituent("negation", "AdverbPhrase", {
      minimum: 0,
      maximum: 1,
      requiredFeatures: { polarity: "negative" },
    }),
    lexical("modal", ["AUX"], { minimum: 0, maximum: 2 }),
    constituent("adverbial", "AdverbPhrase", { minimum: 0, maximum: 3 }),
    lexical("head", ["VERB"]),
    constituent("complement", "Complement", { minimum: 0, maximum: 2 }),
    constituent("object", "NounPhrase", { minimum: 0, maximum: 2 }),
    constituent("aspect", "ParticlePhrase", {
      minimum: 0,
      maximum: 1,
      requiredFeatures: { aspect: "marked" },
    }),
  ]),
  production("phrase.interjection.lexical", "InterjectionPhrase", [
    lexical("head", ["INTJ"]),
  ]),
  production("phrase.symbol.lexical", "SymbolPhrase", [
    lexical("head", ["SYM"]),
  ]),
  production("phrase.unknown.lexical", "UnknownPhrase", [
    lexical("head", ["X"]),
  ]),
  production("phrase.punctuation.lexical", "Punctuation", [
    lexical("head", ["PUNCT"], { requiredFunctions: ["punctuation"] }),
  ]),
  coordinationRule("phrase.noun.coordination", "NounPhrase"),
  coordinationRule("phrase.verb.coordination", "VerbPhrase"),
  coordinationRule("phrase.adjective.coordination", "AdjectivePhrase"),
  coordinationRule("phrase.adverb.coordination", "AdverbPhrase"),
  coordinationRule("phrase.adposition.coordination", "AdpositionPhrase"),
];

export const PHRASE_PRODUCTION_FIXTURES: readonly ProductionFixture[] =
  PHRASE_PRODUCTION_RULES.flatMap(fixturesForRule);

export const FORMAL_SYNTAX_RULES: readonly ProductionRule[] = PHRASE_PRODUCTION_RULES;
export const FORMAL_SYNTAX_FIXTURES: readonly ProductionFixture[] =
  PHRASE_PRODUCTION_FIXTURES;

assertValidGrammarBundle(FORMAL_SYNTAX_RULES, FORMAL_SYNTAX_FIXTURES);
