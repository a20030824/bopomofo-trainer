import { composePracticeSequence } from "../../composition/composer.js";
import type { CompositionStrategyId } from "../../composition/types.js";
import type { PracticeComposerStrategy } from "../strategy-matrix.js";

function adapter(id: CompositionStrategyId): PracticeComposerStrategy {
  return {
    id,
    compose(input) {
      return composePracticeSequence({
        objective: input.objective,
        relationIndex: input.relationIndex,
        entries: input.entries,
        history: input.history,
        budget: input.budget,
        random: input.random,
        policy: { strategy: id, beamWidth: input.beamWidth },
      });
    },
  };
}

export function createCompositionStrategyRegistry(): Readonly<Record<
  CompositionStrategyId,
  PracticeComposerStrategy
>> {
  return {
    "fixed-six-baseline": adapter("fixed-six-baseline"),
    "greedy-marginal-gain": adapter("greedy-marginal-gain"),
    "greedy-gain-per-token": adapter("greedy-gain-per-token"),
    "diversity-aware-greedy": adapter("diversity-aware-greedy"),
    "bounded-beam-search": adapter("bounded-beam-search"),
  };
}
