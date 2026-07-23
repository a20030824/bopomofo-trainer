import { DEFAULT_DERIVATION_BOUNDS } from "./features.js";
import type {
  DerivationBounds,
  ProductionConstituent,
  ProductionRule,
  SyntaxCategory,
} from "./types.js";
import { assertValidGrammar } from "./validate.js";

export interface StructuralDerivationCountOptions {
  readonly rootCategory: SyntaxCategory;
  readonly rules: readonly ProductionRule[];
  readonly bounds?: DerivationBounds;
}

interface BudgetState {
  readonly remainingPhraseDepth: number;
  readonly remainingClauseDepth: number;
  readonly clauseCount: number;
  readonly lexicalCount: number;
}

interface CountResult {
  readonly state: BudgetState;
  readonly count: bigint;
}

const CLAUSE_LIKE = new Set<SyntaxCategory>([
  "Sentence",
  "Clause",
  "ClauseSequence",
  "RelativeClause",
  "ContentClause",
  "QuotedClause",
]);

function stateKey(state: BudgetState): string {
  return [
    state.remainingPhraseDepth,
    state.remainingClauseDepth,
    state.clauseCount,
    state.lexicalCount,
  ].join(":");
}

function mergeCount(
  target: Map<string, CountResult>,
  state: BudgetState,
  count: bigint,
): void {
  if (count === 0n) return;
  const key = stateKey(state);
  const existing = target.get(key);
  target.set(key, {
    state,
    count: (existing?.count ?? 0n) + count,
  });
}

function decrementForRecursiveEdge(
  state: BudgetState,
  constituent: ProductionConstituent,
): BudgetState | null {
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

function buildRulesByOutput(
  rules: readonly ProductionRule[],
): ReadonlyMap<SyntaxCategory, readonly ProductionRule[]> {
  const result = new Map<SyntaxCategory, ProductionRule[]>();
  for (const rule of rules) {
    const current = result.get(rule.output) ?? [];
    current.push(rule);
    result.set(rule.output, current);
  }
  return result;
}

export function countStructuralDerivationShapes(
  options: StructuralDerivationCountOptions,
): string {
  const bounds = options.bounds ?? DEFAULT_DERIVATION_BOUNDS;
  assertValidGrammar(options.rules, bounds);
  const rulesByOutput = buildRulesByOutput(options.rules);
  const memo = new Map<string, readonly CountResult[]>();
  const active = new Set<string>();

  const countCategory = (
    category: SyntaxCategory,
    inputState: BudgetState,
  ): readonly CountResult[] => {
    let state = inputState;
    if (category === "Clause") {
      if (state.clauseCount >= bounds.maximumClausesPerSentence) return [];
      state = { ...state, clauseCount: state.clauseCount + 1 };
    }
    const key = `${category}|${stateKey(state)}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (active.has(key)) {
      throw new Error(`formal grammar recursion did not consume a derivation bound at ${key}`);
    }
    active.add(key);
    const output = new Map<string, CountResult>();
    for (const rule of rulesByOutput.get(category) ?? []) {
      const byKey = new Map(rule.constituents.map((item) => [item.key, item]));
      for (const vector of countVectors(rule.constituents)) {
        for (const order of rule.surfaceOrders) {
          const ordered = order.constituentKeys.map((constituentKey) => {
            const constituent = byKey.get(constituentKey);
            if (constituent === undefined) {
              throw new Error(`unknown constituent ${constituentKey} in ${rule.id}`);
            }
            return constituent;
          });
          let partial = new Map<string, CountResult>();
          mergeCount(partial, state, 1n);
          for (const constituent of ordered) {
            const repetitions = vector[constituent.key] ?? 0;
            for (let repetition = 0; repetition < repetitions; repetition += 1) {
              const next = new Map<string, CountResult>();
              for (const current of partial.values()) {
                const afterDepth = decrementForRecursiveEdge(current.state, constituent);
                if (afterDepth === null) continue;
                if (constituent.category === "Lexeme") {
                  if (afterDepth.lexicalCount >= bounds.maximumLexicalEntriesPerUtterance) {
                    continue;
                  }
                  mergeCount(next, {
                    ...afterDepth,
                    lexicalCount: afterDepth.lexicalCount + 1,
                  }, current.count);
                  continue;
                }
                for (const child of countCategory(constituent.category, afterDepth)) {
                  mergeCount(next, child.state, current.count * child.count);
                }
              }
              partial = next;
              if (partial.size === 0) break;
            }
            if (partial.size === 0) break;
          }
          for (const item of partial.values()) mergeCount(output, item.state, item.count);
        }
      }
    }
    active.delete(key);
    const result = [...output.values()];
    memo.set(key, result);
    return result;
  };

  const initial: BudgetState = {
    remainingPhraseDepth: bounds.maximumPhraseDepth,
    remainingClauseDepth: bounds.maximumClauseNesting,
    clauseCount: 0,
    lexicalCount: 0,
  };
  return countCategory(options.rootCategory, initial)
    .reduce((sum, item) => sum + item.count, 0n)
    .toString(10);
}
