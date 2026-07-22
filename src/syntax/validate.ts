import {
  DEFAULT_DERIVATION_BOUNDS,
  FORBIDDEN_SYNTAX_FIELDS,
  FORMAL_GRAMMAR_VERSION,
  SYNTAX_CATEGORIES,
  SYNTAX_FEATURE_NAMES,
} from "./features.js";
import {
  SYNTACTIC_FUNCTIONS,
  UPOS_VALUES,
  VALENCY_FRAMES,
  type DerivationBounds,
  type ProductionConstituent,
  type ProductionRule,
  type SyntaxCategory,
  type SyntaxFeatureName,
} from "./types.js";

export type GrammarValidationErrorCode =
  | "forbidden-field"
  | "duplicate-rule-id"
  | "invalid-grammar-version"
  | "invalid-category"
  | "duplicate-constituent-key"
  | "invalid-cardinality"
  | "invalid-upos"
  | "invalid-function"
  | "invalid-valency-frame"
  | "invalid-feature"
  | "missing-surface-order"
  | "invalid-surface-order"
  | "invalid-constraint"
  | "missing-positive-fixture"
  | "missing-negative-fixture"
  | "unmarked-recursion-cycle"
  | "invalid-bound";

export interface GrammarValidationError {
  readonly code: GrammarValidationErrorCode;
  readonly message: string;
  readonly ruleId: string | null;
  readonly path: string;
}

export interface GrammarValidationResult {
  readonly errors: readonly GrammarValidationError[];
}

const CATEGORY_SET = new Set<string>(SYNTAX_CATEGORIES);
const FEATURE_SET = new Set<string>(SYNTAX_FEATURE_NAMES);
const UPOS_SET = new Set<string>(UPOS_VALUES);
const FUNCTION_SET = new Set<string>(SYNTACTIC_FUNCTIONS);
const VALENCY_SET = new Set<string>(VALENCY_FRAMES);
const FORBIDDEN_SET = new Set<string>(FORBIDDEN_SYNTAX_FIELDS);

function error(
  code: GrammarValidationErrorCode,
  message: string,
  ruleId: string | null,
  path: string,
): GrammarValidationError {
  return { code, message, ruleId, path };
}

function scanForbiddenFields(
  value: unknown,
  path: string,
  ruleId: string | null,
  errors: GrammarValidationError[],
  visited: WeakSet<object>,
): void {
  if (value === null || typeof value !== "object") return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenFields(
      item,
      `${path}[${index}]`,
      ruleId,
      errors,
      visited,
    ));
    return;
  }
  for (const [key, item] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    const itemPath = `${path}.${key}`;
    if (FORBIDDEN_SET.has(key)) {
      errors.push(error(
        "forbidden-field",
        `formal syntax data contains forbidden field "${key}"`,
        ruleId,
        itemPath,
      ));
    }
    scanForbiddenFields(item, itemPath, ruleId, errors, visited);
  }
}

export function findForbiddenSyntaxFields(value: unknown): readonly GrammarValidationError[] {
  const errors: GrammarValidationError[] = [];
  scanForbiddenFields(value, "$", null, errors, new WeakSet<object>());
  return errors;
}

function validateBounds(bounds: DerivationBounds): readonly GrammarValidationError[] {
  const errors: GrammarValidationError[] = [];
  for (const [key, value] of Object.entries(bounds)) {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(error(
        "invalid-bound",
        `derivation bound ${key} must be a positive finite integer`,
        null,
        `bounds.${key}`,
      ));
    }
  }
  return errors;
}

function validateConstituent(
  rule: ProductionRule,
  constituent: ProductionConstituent,
  index: number,
  errors: GrammarValidationError[],
): void {
  const path = `rules.${rule.id}.constituents[${index}]`;
  if (!CATEGORY_SET.has(constituent.category)) {
    errors.push(error(
      "invalid-category",
      `unknown category ${constituent.category}`,
      rule.id,
      `${path}.category`,
    ));
  }
  if (
    !Number.isInteger(constituent.minimum)
    || !Number.isInteger(constituent.maximum)
    || constituent.minimum < 0
    || constituent.maximum < constituent.minimum
    || !Number.isFinite(constituent.maximum)
  ) {
    errors.push(error(
      "invalid-cardinality",
      `${constituent.key} must have finite integer cardinality 0 <= minimum <= maximum`,
      rule.id,
      path,
    ));
  }
  for (const upos of constituent.allowedUpos) {
    if (!UPOS_SET.has(upos)) {
      errors.push(error(
        "invalid-upos",
        `unknown UPOS ${upos}`,
        rule.id,
        `${path}.allowedUpos`,
      ));
    }
  }
  for (const value of constituent.requiredFunctions) {
    if (!FUNCTION_SET.has(value)) {
      errors.push(error(
        "invalid-function",
        `unknown syntactic function ${value}`,
        rule.id,
        `${path}.requiredFunctions`,
      ));
    }
  }
  for (const value of constituent.requiredValencyFrames) {
    if (!VALENCY_SET.has(value)) {
      errors.push(error(
        "invalid-valency-frame",
        `unknown valency frame ${value}`,
        rule.id,
        `${path}.requiredValencyFrames`,
      ));
    }
  }
  for (const [feature, value] of Object.entries(constituent.requiredFeatures)) {
    if (!FEATURE_SET.has(feature) || !["string", "number", "boolean"].includes(typeof value)) {
      errors.push(error(
        "invalid-feature",
        `invalid formal feature ${feature}`,
        rule.id,
        `${path}.requiredFeatures.${feature}`,
      ));
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(error(
        "invalid-feature",
        `feature ${feature} must be finite`,
        rule.id,
        `${path}.requiredFeatures.${feature}`,
      ));
    }
  }
}

function validateRule(rule: ProductionRule, errors: GrammarValidationError[]): void {
  scanForbiddenFields(rule, `rules.${rule.id}`, rule.id, errors, new WeakSet<object>());
  if (rule.grammarVersion !== FORMAL_GRAMMAR_VERSION) {
    errors.push(error(
      "invalid-grammar-version",
      `rule uses unsupported grammar version ${rule.grammarVersion}`,
      rule.id,
      `rules.${rule.id}.grammarVersion`,
    ));
  }
  if (!CATEGORY_SET.has(rule.output)) {
    errors.push(error(
      "invalid-category",
      `unknown output category ${rule.output}`,
      rule.id,
      `rules.${rule.id}.output`,
    ));
  }
  const keys = new Set<string>();
  rule.constituents.forEach((constituent, index) => {
    if (!constituent.key || keys.has(constituent.key)) {
      errors.push(error(
        "duplicate-constituent-key",
        `constituent key must be non-empty and unique: ${constituent.key}`,
        rule.id,
        `rules.${rule.id}.constituents[${index}].key`,
      ));
    }
    keys.add(constituent.key);
    validateConstituent(rule, constituent, index, errors);
  });
  if (rule.surfaceOrders.length === 0) {
    errors.push(error(
      "missing-surface-order",
      "rule requires at least one surface order",
      rule.id,
      `rules.${rule.id}.surfaceOrders`,
    ));
  }
  const orderIds = new Set<string>();
  for (const [index, order] of rule.surfaceOrders.entries()) {
    const path = `rules.${rule.id}.surfaceOrders[${index}]`;
    const orderKeys = new Set(order.constituentKeys);
    if (
      !order.id
      || orderIds.has(order.id)
      || orderKeys.size !== keys.size
      || order.constituentKeys.length !== keys.size
      || [...keys].some((key) => !orderKeys.has(key))
    ) {
      errors.push(error(
        "invalid-surface-order",
        "surface order IDs must be unique and each order must place every constituent exactly once",
        rule.id,
        path,
      ));
    }
    orderIds.add(order.id);
  }
  for (const [index, constraint] of rule.constraints.entries()) {
    let constraintKeys: readonly string[];
    switch (constraint.kind) {
      case "feature-equals":
      case "feature-not-equals":
        constraintKeys = [constraint.constituentKey];
        break;
      case "requires-constituent":
      case "forbids-cooccurrence":
        constraintKeys = [constraint.ifPresentKey, constraint.targetKey];
        break;
    }
    if (constraintKeys.some((key) => !keys.has(key))) {
      errors.push(error(
        "invalid-constraint",
        `constraint references an unknown constituent: ${constraintKeys.join(", ")}`,
        rule.id,
        `rules.${rule.id}.constraints[${index}]`,
      ));
    }
    if (
      (constraint.kind === "feature-equals" || constraint.kind === "feature-not-equals")
      && !FEATURE_SET.has(constraint.feature)
    ) {
      errors.push(error(
        "invalid-feature",
        `constraint references unknown feature ${constraint.feature}`,
        rule.id,
        `rules.${rule.id}.constraints[${index}].feature`,
      ));
    }
  }
  if (rule.positiveFixtureIds.length === 0) {
    errors.push(error(
      "missing-positive-fixture",
      "rule requires a positive fixture",
      rule.id,
      `rules.${rule.id}.positiveFixtureIds`,
    ));
  }
  if (rule.negativeFixtureIds.length === 0) {
    errors.push(error(
      "missing-negative-fixture",
      "rule requires a negative fixture",
      rule.id,
      `rules.${rule.id}.negativeFixtureIds`,
    ));
  }
}

interface GraphEdge {
  readonly to: SyntaxCategory;
  readonly recursive: boolean;
  readonly ruleId: string;
  readonly path: string;
}

function validateRecursionCycles(
  rules: readonly ProductionRule[],
  errors: GrammarValidationError[],
): void {
  const graph = new Map<SyntaxCategory, GraphEdge[]>();
  for (const rule of rules) {
    for (const [index, constituent] of rule.constituents.entries()) {
      if (constituent.maximum <= 0) continue;
      const edges = graph.get(rule.output) ?? [];
      edges.push({
        to: constituent.category,
        recursive: constituent.recursive,
        ruleId: rule.id,
        path: `rules.${rule.id}.constituents[${index}]`,
      });
      graph.set(rule.output, edges);
    }
  }
  const complete = new Set<SyntaxCategory>();
  const pathCategories: SyntaxCategory[] = [];
  const pathEdges: GraphEdge[] = [];
  const reported = new Set<string>();
  const visit = (category: SyntaxCategory): void => {
    if (complete.has(category)) return;
    const existingIndex = pathCategories.indexOf(category);
    if (existingIndex >= 0) return;
    pathCategories.push(category);
    for (const edge of graph.get(category) ?? []) {
      const targetIndex = pathCategories.indexOf(edge.to);
      if (targetIndex >= 0) {
        const cycleEdges = [...pathEdges.slice(targetIndex), edge];
        for (const cycleEdge of cycleEdges.filter((item) => !item.recursive)) {
          const key = `${cycleEdge.ruleId}:${cycleEdge.path}`;
          if (reported.has(key)) continue;
          errors.push(error(
            "unmarked-recursion-cycle",
            `cycle through ${edge.to} contains an edge that is not explicitly recursive`,
            cycleEdge.ruleId,
            `${cycleEdge.path}.recursive`,
          ));
          reported.add(key);
        }
        continue;
      }
      pathEdges.push(edge);
      visit(edge.to);
      pathEdges.pop();
    }
    pathCategories.pop();
    complete.add(category);
  };
  for (const category of SYNTAX_CATEGORIES) visit(category);
}

export function validateGrammar(
  rules: readonly ProductionRule[],
  bounds: DerivationBounds = DEFAULT_DERIVATION_BOUNDS,
): GrammarValidationResult {
  const errors: GrammarValidationError[] = [...validateBounds(bounds)];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id)) {
      errors.push(error(
        "duplicate-rule-id",
        `rule ID must be non-empty and unique: ${rule.id}`,
        rule.id || null,
        "rules",
      ));
    }
    ids.add(rule.id);
    validateRule(rule, errors);
  }
  validateRecursionCycles(rules, errors);
  return { errors };
}

export function assertValidGrammar(
  rules: readonly ProductionRule[],
  bounds: DerivationBounds = DEFAULT_DERIVATION_BOUNDS,
): void {
  const result = validateGrammar(rules, bounds);
  if (result.errors.length === 0) return;
  throw new Error(result.errors
    .map((item) => `${item.code} at ${item.path}: ${item.message}`)
    .join("\n"));
}

export function isSyntaxCategory(value: string): value is SyntaxCategory {
  return CATEGORY_SET.has(value);
}

export function isSyntaxFeatureName(value: string): value is SyntaxFeatureName {
  return FEATURE_SET.has(value);
}
