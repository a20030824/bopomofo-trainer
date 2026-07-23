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
  type ProductionFixture,
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
  | "invalid-bound"
  | "duplicate-fixture-id"
  | "missing-fixture"
  | "fixture-rule-mismatch"
  | "invalid-fixture-count"
  | "invalid-fixture-order"
  | "fixture-expectation-mismatch";

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
    errors.push(error("invalid-category", `unknown category ${constituent.category}`, rule.id, `${path}.category`));
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
      errors.push(error("invalid-upos", `unknown UPOS ${upos}`, rule.id, `${path}.allowedUpos`));
    }
  }
  for (const value of constituent.requiredFunctions) {
    if (!FUNCTION_SET.has(value)) {
      errors.push(error("invalid-function", `unknown syntactic function ${value}`, rule.id, `${path}.requiredFunctions`));
    }
  }
  for (const value of constituent.requiredValencyFrames) {
    if (!VALENCY_SET.has(value)) {
      errors.push(error("invalid-valency-frame", `unknown valency frame ${value}`, rule.id, `${path}.requiredValencyFrames`));
    }
  }
  for (const [feature, value] of Object.entries(constituent.requiredFeatures)) {
    if (!FEATURE_SET.has(feature) || !["string", "number", "boolean"].includes(typeof value)) {
      errors.push(error("invalid-feature", `invalid formal feature ${feature}`, rule.id, `${path}.requiredFeatures.${feature}`));
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(error("invalid-feature", `feature ${feature} must be finite`, rule.id, `${path}.requiredFeatures.${feature}`));
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
    errors.push(error("invalid-category", `unknown output category ${rule.output}`, rule.id, `rules.${rule.id}.output`));
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
    errors.push(error("missing-surface-order", "rule requires at least one surface order", rule.id, `rules.${rule.id}.surfaceOrders`));
  }
  const orderIds = new Set<string>();
  for (const [index, order] of rule.surfaceOrders.entries()) {
    const path = `rules.${rule.id}.surfaceOrders[${index}]`;
    const orderKeys = new Set(order.constituentKeys);
    if (!order.id || orderIds.has(order.id) || orderKeys.size !== keys.size
      || order.constituentKeys.length !== keys.size
      || [...keys].some((key) => !orderKeys.has(key))) {
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
    if ((constraint.kind === "feature-equals" || constraint.kind === "feature-not-equals")
      && !FEATURE_SET.has(constraint.feature)) {
      errors.push(error(
        "invalid-feature",
        `constraint references unknown feature ${constraint.feature}`,
        rule.id,
        `rules.${rule.id}.constraints[${index}].feature`,
      ));
    }
  }
  if (rule.positiveFixtureIds.length === 0) {
    errors.push(error("missing-positive-fixture", "rule requires a positive fixture", rule.id, `rules.${rule.id}.positiveFixtureIds`));
  }
  if (rule.negativeFixtureIds.length === 0) {
    errors.push(error("missing-negative-fixture", "rule requires a negative fixture", rule.id, `rules.${rule.id}.negativeFixtureIds`));
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
        if (!cycleEdges.some((item) => item.recursive)) {
          const key = cycleEdges.map((item) => `${item.ruleId}:${item.path}`).join("|");
          if (!reported.has(key)) {
            errors.push(error(
              "unmarked-recursion-cycle",
              `cycle through ${edge.to} has no recursive edge that consumes depth budget`,
              edge.ruleId,
              `${edge.path}.recursive`,
            ));
            reported.add(key);
          }
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
      errors.push(error("duplicate-rule-id", `rule ID must be non-empty and unique: ${rule.id}`, rule.id || null, "rules"));
    }
    ids.add(rule.id);
    validateRule(rule, errors);
  }
  validateRecursionCycles(rules, errors);
  return { errors };
}

function fixtureViolatesRule(
  rule: ProductionRule,
  fixture: ProductionFixture,
): boolean {
  const counts = fixture.constituentCounts;
  if (!rule.surfaceOrders.some((order) => order.id === fixture.surfaceOrderId)) return true;
  const keys = new Set(rule.constituents.map((item) => item.key));
  if (Object.keys(counts).some((key) => !keys.has(key))) return true;
  for (const constituent of rule.constituents) {
    const count = counts[constituent.key] ?? 0;
    if (!Number.isInteger(count) || count < constituent.minimum || count > constituent.maximum) {
      return true;
    }
  }
  return false;
}

export function validateGrammarBundle(
  rules: readonly ProductionRule[],
  fixtures: readonly ProductionFixture[],
  bounds: DerivationBounds = DEFAULT_DERIVATION_BOUNDS,
): GrammarValidationResult {
  const errors = [...validateGrammar(rules, bounds).errors];
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const fixturesById = new Map<string, ProductionFixture>();
  for (const fixture of fixtures) {
    if (!fixture.id || fixturesById.has(fixture.id)) {
      errors.push(error(
        "duplicate-fixture-id",
        `fixture ID must be non-empty and unique: ${fixture.id}`,
        fixture.ruleId || null,
        "fixtures",
      ));
    }
    fixturesById.set(fixture.id, fixture);
    const rule = rulesById.get(fixture.ruleId);
    if (rule === undefined) {
      errors.push(error(
        "fixture-rule-mismatch",
        `fixture references unknown rule ${fixture.ruleId}`,
        fixture.ruleId || null,
        `fixtures.${fixture.id}.ruleId`,
      ));
      continue;
    }
    const orderExists = rule.surfaceOrders.some((order) => order.id === fixture.surfaceOrderId);
    if (!orderExists) {
      errors.push(error(
        "invalid-fixture-order",
        `fixture references unknown surface order ${fixture.surfaceOrderId}`,
        rule.id,
        `fixtures.${fixture.id}.surfaceOrderId`,
      ));
    }
    for (const [key, count] of Object.entries(fixture.constituentCounts)) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(error(
          "invalid-fixture-count",
          `fixture count for ${key} must be a non-negative integer`,
          rule.id,
          `fixtures.${fixture.id}.constituentCounts.${key}`,
        ));
      }
    }
    const violates = fixtureViolatesRule(rule, fixture);
    if ((fixture.expected === "accept" && violates)
      || (fixture.expected === "reject" && !violates)) {
      errors.push(error(
        "fixture-expectation-mismatch",
        `fixture expected ${fixture.expected} but its formal cardinality and order ${violates ? "violate" : "satisfy"} the rule`,
        rule.id,
        `fixtures.${fixture.id}`,
      ));
    }
  }
  for (const rule of rules) {
    for (const fixtureId of [...rule.positiveFixtureIds, ...rule.negativeFixtureIds]) {
      const fixture = fixturesById.get(fixtureId);
      if (fixture === undefined) {
        errors.push(error(
          "missing-fixture",
          `rule references missing fixture ${fixtureId}`,
          rule.id,
          `rules.${rule.id}`,
        ));
      } else if (fixture.ruleId !== rule.id) {
        errors.push(error(
          "fixture-rule-mismatch",
          `fixture ${fixtureId} belongs to ${fixture.ruleId}, not ${rule.id}`,
          rule.id,
          `rules.${rule.id}`,
        ));
      }
    }
    for (const fixtureId of rule.positiveFixtureIds) {
      if (fixturesById.get(fixtureId)?.expected !== "accept") {
        errors.push(error(
          "fixture-expectation-mismatch",
          `positive fixture ${fixtureId} must expect accept`,
          rule.id,
          `rules.${rule.id}.positiveFixtureIds`,
        ));
      }
    }
    for (const fixtureId of rule.negativeFixtureIds) {
      if (fixturesById.get(fixtureId)?.expected !== "reject") {
        errors.push(error(
          "fixture-expectation-mismatch",
          `negative fixture ${fixtureId} must expect reject`,
          rule.id,
          `rules.${rule.id}.negativeFixtureIds`,
        ));
      }
    }
  }
  return { errors };
}

export function assertValidGrammarBundle(
  rules: readonly ProductionRule[],
  fixtures: readonly ProductionFixture[],
  bounds: DerivationBounds = DEFAULT_DERIVATION_BOUNDS,
): void {
  const result = validateGrammarBundle(rules, fixtures, bounds);
  if (result.errors.length === 0) return;
  throw new Error(result.errors
    .map((item) => `${item.code} at ${item.path}: ${item.message}`)
    .join("\n"));
}

export function assertValidGrammar(
  rules: readonly ProductionRule[],
  bounds: DerivationBounds = DEFAULT_DERIVATION_BOUNDS,
): void {
  const result = validateGrammar(rules, bounds);
  if (result.errors.length === 0) return;
  throw new Error(result.errors.map((item) => `${item.code} at ${item.path}: ${item.message}`).join("\n"));
}

export function isSyntaxCategory(value: string): value is SyntaxCategory {
  return CATEGORY_SET.has(value);
}

export function isSyntaxFeatureName(value: string): value is SyntaxFeatureName {
  return FEATURE_SET.has(value);
}
