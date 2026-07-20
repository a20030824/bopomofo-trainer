import { partitionBindingPreservingBaseline } from "../../relations/partition/binding-baseline.js";
import { partitionFrequencyStratified } from "../../relations/partition/frequency-stratified.js";
import {
  partitionPathNovelty,
  partitionRelationSupportPreserving,
  partitionSeededMaximumCoverage,
} from "../../relations/partition/strategies.js";
import type { PartitionPolicyId } from "../../relations/partition/types.js";
import type { PartitionSelectorStrategy } from "../strategy-matrix.js";

export function createPartitionStrategyRegistry(
  allowCrossBandFallback: boolean,
): Readonly<Record<PartitionPolicyId, PartitionSelectorStrategy>> {
  return {
    "binding-preserving-baseline-v1": {
      id: "binding-preserving-baseline-v1",
      partition: (input, options) => partitionBindingPreservingBaseline(input, options),
    },
    "relation-support-preserving-v1": {
      id: "relation-support-preserving-v1",
      partition: (input, options) => partitionRelationSupportPreserving(input, options),
    },
    "frequency-stratified-v1": {
      id: "frequency-stratified-v1",
      partition: (input, options) => partitionFrequencyStratified(input, {
        ...options,
        allowCrossBandFallback,
      }),
    },
    "seeded-maximum-coverage-v1": {
      id: "seeded-maximum-coverage-v1",
      partition: (input, options, seed) => partitionSeededMaximumCoverage(input, seed, options),
    },
    "path-novelty-v1": {
      id: "path-novelty-v1",
      partition: (input, options) => partitionPathNovelty(input, options),
    },
  };
}
