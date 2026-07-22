import { sha256Canonical } from "../reference/importers/canonical-json.js";
import { DEFAULT_DERIVATION_BOUNDS, FORMAL_GRAMMAR_VERSION } from "./features.js";
import type {
  DerivationBounds,
  ProductionConstituent,
  ProductionRule,
  SyntacticFunction,
  SyntaxCategory,
  SyntaxFeatureSet,
  Upos,
  ValencyFrame,
} from "./types.js";
import { assertValidGrammar } from "./validate.js";

export interface StructuralLexicalSlot {
  readonly kind: "lexical-slot";
  readonly id: string;
  readonly constituentKey: string;
  readonly occurrenceIndex: number;
  readonly allowedUpos: readonly Upos[];
  readonly requiredFunctions: readonly SyntacticFunction[];
  readonly requiredValencyFrames: readonly ValencyFrame[];
  readonly requiredFeatures: SyntaxFeatureSet;
}

export interface StructuralSyntaxNode {
  readonly kind: "syntax-node";
  readonly id: string;
  readonly category: SyntaxCategory;
  readonly productionRuleId: string;
  readonly surfaceOrderId: string;
  readonly children: readonly StructuralElement[];
}

export type StructuralElement = StructuralLexicalSlot | StructuralSyntaxNode;

export interface StructuralDerivationShape {
  readonly id: string;
  readonly grammarVersion: typeof FORMAL_GRAMMAR_VERSION;
  readonly root: StructuralSyntaxNode;
  readonly productionRulePath: readonly string[];
  readonly lexicalSlots: readonly StructuralLexicalSlot[];
  readonly clauseCount: number;
  readonly lexicalSlotCount: number;
}

export interface StructuralDerivationOptions {
  readonly rootCategory: SyntaxCategory;
  readonly rules: readonly ProductionRule[];
  readonly bounds?: DerivationBounds;
}

interface ExpansionState {
  readonly remainingPhraseDepth: number;
  readonly remainingClauseDepth: number;
  readonly clauseCount: number;
  readonly lexicalCount: number;
}

interface ExpandedElement {
  readonly element: StructuralElement;
  readonly state: ExpansionState;
  readonly rulePath: readonly string[];
  readonly slots: readonly StructuralLexicalSlot[];
}

const CLAUSE_LIKE = new Set<SyntaxCategory>([
  "Sentence",
  "Clause",
  "ClauseSequence",
  "RelativeClause",
  "ContentClause",
  "QuotedClause",
]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decrementForRecursiveEdge(
  state: ExpansionState,
  constituent: ProductionConstituent,
): ExpansionState | null {
  if (!constituent.recursive) return state;
  if (CLAUSE_LIKE.has(constituent.category)) {
    if (state.remainingClauseDepth <= 0) return null;
    return { ...state, remainingClauseDepth: state.remainingClauseDepth - 1 };
  }
  if (state.remainingPhraseDepth <= 0) return null;
  return { ...state, remainingPhraseDepth: state.remainingPhraseDepth - 1 };
}

function* countVectors(
  constituents: readonly ProductionConstituent[],
  index = 0,
  current: Readonly<Record<string, number>> = {},
): Generator<Readonly<Record<string, number>>> {
  const constituent = constituents[index];
  if (constituent === undefined) {
    yield current;
    return;
  }
  for (let count = constituent.minimum; count <= constituent.maximum; count += 1) {
    yield* countVectors(constituents, index + 1, {
      ...current,
      [constituent.key]: count,
    });
  }
}

function makeSlot(
  constituent: ProductionConstituent,
  occurrenceIndex: number,
  path: readonly string[],
): StructuralLexicalSlot {
  const identity = {
    path,
    key: constituent.key,
    occurrenceIndex,
    allowedUpos: constituent.allowedUpos,
    requiredFunctions: constituent.requiredFunctions,
    requiredValencyFrames: constituent.requiredValencyFrames,
    requiredFeatures: constituent.requiredFeatures,
  };
  return {
    kind: "lexical-slot",
    id: `syntax-slot:${sha256Canonical(identity)}`,
    constituentKey: constituent.key,
    occurrenceIndex,
    allowedUpos: constituent.allowedUpos,
    requiredFunctions: constituent.requiredFunctions,
    requiredValencyFrames: constituent.requiredValencyFrames,
    requiredFeatures: constituent.requiredFeatures,
  };
}

function* expandConstituentOccurrences(
  constituent: ProductionConstituent,
  count: number,
  rulesByOutput: ReadonlyMap<SyntaxCategory, readonly ProductionRule[]>,
  bounds: DerivationBounds,
  state: ExpansionState,
  path: readonly string[],
  occurrenceIndex = 0,
  accumulated: readonly StructuralElement[] = [],
  rulePath: readonly string[] = [],
  slots: readonly StructuralLexicalSlot[] = [],
): Generator<{
  readonly elements: readonly StructuralElement[];
  readonly state: ExpansionState;
  readonly rulePath: readonly string[];
  readonly slots: readonly StructuralLexicalSlot[];
}> {
  if (occurrenceIndex >= count) {
    yield { elements: accumulated, state, rulePath, slots };
    return;
  }
  const nextState = decrementForRecursiveEdge(state, constituent);
  if (nextState === null) return;
  if (constituent.category === "Lexeme") {
    if (nextState.lexicalCount >= bounds.maximumLexicalEntriesPerUtterance) return;
    const slot = makeSlot(constituent, occurrenceIndex, path);
    yield* expandConstituentOccurrences(
      constituent,
      count,
      rulesByOutput,
      bounds,
      { ...nextState, lexicalCount: nextState.lexicalCount + 1 },
      path,
      occurrenceIndex + 1,
      [...accumulated, slot],
      rulePath,
      [...slots, slot],
    );
    return;
  }
  for (const expanded of expandCategory(
    constituent.category,
    rulesByOutput,
    bounds,
    nextState,
    [...path, `${constituent.key}[${occurrenceIndex}]`],
  )) {
    yield* expandConstituentOccurrences(
      constituent,
      count,
      rulesByOutput,
      bounds,
      expanded.state,
      path,
      occurrenceIndex + 1,
      [...accumulated, expanded.element],
      [...rulePath, ...expanded.rulePath],
      [...slots, ...expanded.slots],
    );
  }
}

function* expandOrderedConstituents(
  ordered: readonly ProductionConstituent[],
  counts: Readonly<Record<string, number>>,
  rulesByOutput: ReadonlyMap<SyntaxCategory, readonly ProductionRule[]>,
  bounds: DerivationBounds,
  state: ExpansionState,
  path: readonly string[],
  index = 0,
  children: readonly StructuralElement[] = [],
  rulePath: readonly string[] = [],
  slots: readonly StructuralLexicalSlot[] = [],
): Generator<{
  readonly children: readonly StructuralElement[];
  readonly state: ExpansionState;
  readonly rulePath: readonly string[];
  readonly slots: readonly StructuralLexicalSlot[];
}> {
  const constituent = ordered[index];
  if (constituent === undefined) {
    yield { children, state, rulePath, slots };
    return;
  }
  const count = counts[constituent.key] ?? 0;
  for (const expansion of expandConstituentOccurrences(
    constituent,
    count,
    rulesByOutput,
    bounds,
    state,
    [...path, constituent.key],
  )) {
    yield* expandOrderedConstituents(
      ordered,
      counts,
      rulesByOutput,
      bounds,
      expansion.state,
      path,
      index + 1,
      [...children, ...expansion.elements],
      [...rulePath, ...expansion.rulePath],
      [...slots, ...expansion.slots],
    );
  }
}

function* expandCategory(
  category: SyntaxCategory,
  rulesByOutput: ReadonlyMap<SyntaxCategory, readonly ProductionRule[]>,
  bounds: DerivationBounds,
  inputState: ExpansionState,
  path: readonly string[],
): Generator<ExpandedElement> {
  let state = inputState;
  if (category === "Clause") {
    if (state.clauseCount >= bounds.maximumClausesPerSentence) return;
    state = { ...state, clauseCount: state.clauseCount + 1 };
  }
  const rules = rulesByOutput.get(category) ?? [];
  for (const rule of rules) {
    const constituentsByKey = new Map(rule.constituents.map((item) => [item.key, item]));
    for (const counts of countVectors(rule.constituents)) {
      for (const order of [...rule.surfaceOrders].sort((left, right) => compareText(left.id, right.id))) {
        const ordered = order.constituentKeys.map((key) => {
          const item = constituentsByKey.get(key);
          if (item === undefined) throw new Error(`unknown constituent ${key} in ${rule.id}`);
          return item;
        });
        for (const expanded of expandOrderedConstituents(
          ordered,
          counts,
          rulesByOutput,
          bounds,
          state,
          [...path, rule.id, order.id],
        )) {
          const identity = {
            category,
            productionRuleId: rule.id,
            surfaceOrderId: order.id,
            children: expanded.children,
          };
          const node: StructuralSyntaxNode = {
            kind: "syntax-node",
            id: `syntax-node:${sha256Canonical(identity)}`,
            category,
            productionRuleId: rule.id,
            surfaceOrderId: order.id,
            children: expanded.children,
          };
          yield {
            element: node,
            state: expanded.state,
            rulePath: [rule.id, ...expanded.rulePath],
            slots: expanded.slots,
          };
        }
      }
    }
  }
}

export function* enumerateStructuralDerivations(
  options: StructuralDerivationOptions,
): Generator<StructuralDerivationShape> {
  const bounds = options.bounds ?? DEFAULT_DERIVATION_BOUNDS;
  assertValidGrammar(options.rules, bounds);
  const rulesByOutput = new Map<SyntaxCategory, readonly ProductionRule[]>();
  for (const rule of [...options.rules].sort((left, right) => compareText(left.id, right.id))) {
    const current = rulesByOutput.get(rule.output) ?? [];
    rulesByOutput.set(rule.output, [...current, rule]);
  }
  const initialState: ExpansionState = {
    remainingPhraseDepth: bounds.maximumPhraseDepth,
    remainingClauseDepth: bounds.maximumClauseNesting,
    clauseCount: 0,
    lexicalCount: 0,
  };
  for (const expansion of expandCategory(
    options.rootCategory,
    rulesByOutput,
    bounds,
    initialState,
    [options.rootCategory],
  )) {
    if (expansion.element.kind !== "syntax-node") continue;
    const identity = {
      grammarVersion: FORMAL_GRAMMAR_VERSION,
      root: expansion.element,
      productionRulePath: expansion.rulePath,
    };
    yield {
      id: `derivation-shape:${sha256Canonical(identity)}`,
      grammarVersion: FORMAL_GRAMMAR_VERSION,
      root: expansion.element,
      productionRulePath: expansion.rulePath,
      lexicalSlots: expansion.slots,
      clauseCount: expansion.state.clauseCount,
      lexicalSlotCount: expansion.state.lexicalCount,
    };
  }
}

export function collectStructuralDerivations(
  options: StructuralDerivationOptions,
  maximumShapes: number,
): readonly StructuralDerivationShape[] {
  if (!Number.isInteger(maximumShapes) || maximumShapes <= 0) {
    throw new Error("maximumShapes must be a positive integer");
  }
  const result: StructuralDerivationShape[] = [];
  for (const shape of enumerateStructuralDerivations(options)) {
    result.push(shape);
    if (result.length >= maximumShapes) break;
  }
  return result;
}
