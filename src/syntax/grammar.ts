import {
  FORMAL_SYNTAX_FIXTURES as BASE_FORMAL_SYNTAX_FIXTURES,
  FORMAL_SYNTAX_RULES as BASE_FORMAL_SYNTAX_RULES,
} from "./rules.js";
import {
  COMPLEX_PRODUCTION_FIXTURES,
  COMPLEX_PRODUCTION_RULES,
} from "./complex-rules.js";
import type { ProductionFixture, ProductionRule } from "./types.js";
import { assertValidGrammarBundle } from "./validate.js";

export const FORMAL_SYNTAX_RULES: readonly ProductionRule[] = [
  ...BASE_FORMAL_SYNTAX_RULES,
  ...COMPLEX_PRODUCTION_RULES,
];

export const FORMAL_SYNTAX_FIXTURES: readonly ProductionFixture[] = [
  ...BASE_FORMAL_SYNTAX_FIXTURES,
  ...COMPLEX_PRODUCTION_FIXTURES,
];

export { COMPLEX_PRODUCTION_FIXTURES, COMPLEX_PRODUCTION_RULES };
export * from "./rules.js";

assertValidGrammarBundle(FORMAL_SYNTAX_RULES, FORMAL_SYNTAX_FIXTURES);
