import type { PracticeMode } from "../core/model.js";
import type {
  BindingRelationRef,
  TransitionRelationRef,
} from "./types.js";
import { listSupportedCatalogSyllableBodies } from "../scheme/syllable-grammar.js";
import {
  TONES,
  ZHUYIN_TOKENS,
  toneToken,
  zhuyinToken,
} from "../scheme/tokens.js";
import {
  bindingRelationKey,
  transitionRelationKey,
} from "./catalog-occurrences.js";

export interface RelationUniverse {
  readonly bindings: Readonly<Record<string, BindingRelationRef>>;
  readonly transitions: Readonly<Record<string, TransitionRelationRef>>;
}

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
}

export function createRelationUniverse(
  mode: PracticeMode,
  layoutId: string,
): RelationUniverse {
  const bindings = ZHUYIN_TOKENS.map((token) => [
    bindingRelationKey(token.id),
    { kind: "binding", scope: { mode, layoutId, tokenId: token.id } },
  ] as const);
  const transitions = new Map<string, TransitionRelationRef>();

  const addTransition = (fromToken: string, toToken: string): void => {
    const key = transitionRelationKey(fromToken, toToken);
    transitions.set(key, {
      kind: "transition",
      scope: { mode, layoutId, fromToken, toToken },
    });
  };

  for (const body of listSupportedCatalogSyllableBodies()) {
    const tokens = [...body].map(zhuyinToken);
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      addTransition(tokens[index]!, tokens[index + 1]!);
    }
    const last = tokens.at(-1);
    if (last !== undefined) {
      for (const tone of TONES) addTransition(last, toneToken(tone));
    }
  }

  return {
    bindings: sortedRecord(bindings),
    transitions: sortedRecord([...transitions.entries()]),
  };
}
