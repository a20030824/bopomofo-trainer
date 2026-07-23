import type { RandomSource } from "../core/model.js";
import { stableRuntimeDigest } from "../core/stable-id.js";
import { DEFAULT_DERIVATION_BOUNDS, FORMAL_GRAMMAR_VERSION } from "./features.js";
import type {
  StructuralDerivationShape,
  StructuralElement,
  StructuralLexicalSlot,
  StructuralSyntaxNode,
} from "./derive.js";
import type {
  DerivationBounds,
  ProductionConstituent,
  ProductionRule,
  SyntaxCategory,
} from "./types.js";
import { assertValidGrammar } from "./validate.js";

export interface StructuralSamplingOptions {
  readonly rootCategory: SyntaxCategory;
  readonly rules: readonly ProductionRule[];
  readonly random: RandomSource;
  readonly bounds?: DerivationBounds;
  readonly maximumAttempts?: number;
}

interface State {
  readonly remainingPhraseDepth: number;
  readonly remainingClauseDepth: number;
  readonly clauseCount: number;
  readonly lexicalCount: number;
}

interface Sampled {
  readonly element: StructuralElement;
  readonly state: State;
  readonly rulePath: readonly string[];
  readonly slots: readonly StructuralLexicalSlot[];
}

const CLAUSE_LIKE = new Set<SyntaxCategory>([
  "Sentence", "Clause", "ClauseSequence", "RelativeClause", "ContentClause", "QuotedClause",
]);

function nextUnit(random: RandomSource): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("RandomSource.next() must return a finite value in [0, 1)");
  }
  return value;
}

function chooseIndex(random: RandomSource, size: number): number {
  return Math.min(size - 1, Math.floor(nextUnit(random) * size));
}

function shuffled<T>(values: readonly T[], random: RandomSource): readonly T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = chooseIndex(random, index + 1);
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function decrement(state: State, constituent: ProductionConstituent): State | null {
  if (!constituent.recursive) return state;
  if (CLAUSE_LIKE.has(constituent.category)) {
    if (state.remainingClauseDepth <= 0) return null;
    return { ...state, remainingClauseDepth: state.remainingClauseDepth - 1 };
  }
  if (state.remainingPhraseDepth <= 0) return null;
  return { ...state, remainingPhraseDepth: state.remainingPhraseDepth - 1 };
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
    id: `syntax-slot:${stableRuntimeDigest(identity)}`,
    constituentKey: constituent.key,
    occurrenceIndex,
    allowedUpos: constituent.allowedUpos,
    requiredFunctions: constituent.requiredFunctions,
    requiredValencyFrames: constituent.requiredValencyFrames,
    requiredFeatures: constituent.requiredFeatures,
  };
}

function sampleCategory(
  category: SyntaxCategory,
  rulesByOutput: ReadonlyMap<SyntaxCategory, readonly ProductionRule[]>,
  random: RandomSource,
  bounds: DerivationBounds,
  inputState: State,
  path: readonly string[],
): Sampled | null {
  let state = inputState;
  if (category === "Clause") {
    if (state.clauseCount >= bounds.maximumClausesPerSentence) return null;
    state = { ...state, clauseCount: state.clauseCount + 1 };
  }
  const candidates = shuffled(rulesByOutput.get(category) ?? [], random);
  for (const rule of candidates) {
    const order = rule.surfaceOrders[chooseIndex(random, rule.surfaceOrders.length)];
    if (order === undefined) continue;
    const byKey = new Map(rule.constituents.map((item) => [item.key, item]));
    const ordered = order.constituentKeys.map((key) => byKey.get(key));
    if (ordered.some((item) => item === undefined)) continue;
    let workingState = state;
    const children: StructuralElement[] = [];
    const slots: StructuralLexicalSlot[] = [];
    const rulePath: string[] = [rule.id];
    let failed = false;
    for (const maybeConstituent of ordered) {
      const constituent = maybeConstituent!;
      const range = constituent.maximum - constituent.minimum + 1;
      const count = constituent.minimum + chooseIndex(random, range);
      for (let occurrenceIndex = 0; occurrenceIndex < count; occurrenceIndex += 1) {
        const afterDepth = decrement(workingState, constituent);
        if (afterDepth === null) {
          failed = true;
          break;
        }
        workingState = afterDepth;
        if (constituent.category === "Lexeme") {
          if (workingState.lexicalCount >= bounds.maximumLexicalEntriesPerUtterance) {
            failed = true;
            break;
          }
          const slot = makeSlot(constituent, occurrenceIndex, [...path, rule.id, constituent.key]);
          children.push(slot);
          slots.push(slot);
          workingState = { ...workingState, lexicalCount: workingState.lexicalCount + 1 };
          continue;
        }
        const child = sampleCategory(
          constituent.category,
          rulesByOutput,
          random,
          bounds,
          workingState,
          [...path, rule.id, `${constituent.key}[${occurrenceIndex}]`],
        );
        if (child === null) {
          failed = true;
          break;
        }
        children.push(child.element);
        slots.push(...child.slots);
        rulePath.push(...child.rulePath);
        workingState = child.state;
      }
      if (failed) break;
    }
    if (failed) continue;
    const identity = {
      category,
      productionRuleId: rule.id,
      surfaceOrderId: order.id,
      children,
    };
    const node: StructuralSyntaxNode = {
      kind: "syntax-node",
      id: `syntax-node:${stableRuntimeDigest(identity)}`,
      category,
      productionRuleId: rule.id,
      surfaceOrderId: order.id,
      children,
    };
    return { element: node, state: workingState, rulePath, slots };
  }
  return null;
}

export function sampleStructuralDerivation(
  options: StructuralSamplingOptions,
): StructuralDerivationShape | null {
  const bounds = options.bounds ?? DEFAULT_DERIVATION_BOUNDS;
  const maximumAttempts = options.maximumAttempts ?? 16;
  if (!Number.isInteger(maximumAttempts) || maximumAttempts <= 0) {
    throw new Error("maximumAttempts must be a positive integer");
  }
  assertValidGrammar(options.rules, bounds);
  const rulesByOutput = new Map<SyntaxCategory, readonly ProductionRule[]>();
  for (const rule of options.rules) {
    rulesByOutput.set(rule.output, [...(rulesByOutput.get(rule.output) ?? []), rule]);
  }
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const sampled = sampleCategory(
      options.rootCategory,
      rulesByOutput,
      options.random,
      bounds,
      {
        remainingPhraseDepth: bounds.maximumPhraseDepth,
        remainingClauseDepth: bounds.maximumClauseNesting,
        clauseCount: 0,
        lexicalCount: 0,
      },
      [options.rootCategory],
    );
    if (sampled === null || sampled.element.kind !== "syntax-node") continue;
    const identity = {
      grammarVersion: FORMAL_GRAMMAR_VERSION,
      root: sampled.element,
      productionRulePath: sampled.rulePath,
    };
    return {
      id: `derivation-shape:${stableRuntimeDigest(identity)}`,
      grammarVersion: FORMAL_GRAMMAR_VERSION,
      root: sampled.element,
      productionRulePath: sampled.rulePath,
      lexicalSlots: sampled.slots,
      clauseCount: sampled.state.clauseCount,
      lexicalSlotCount: sampled.state.lexicalCount,
    };
  }
  return null;
}
