export interface ReferenceRelationContribution {
  readonly occurrenceCounts: Readonly<Record<string, number>>;
  readonly bindingKeys: readonly string[];
  readonly transitionKeys: readonly string[];
  readonly entryInitialBindingKeys: readonly string[];
  readonly partitionRepairBindingKeys: readonly string[];
  readonly partitionRepairTransitionKeys: readonly string[];
  readonly rareOnlyBindingKeys: readonly string[];
  readonly rareOnlyTransitionKeys: readonly string[];
  readonly concentratedBindingKeys: readonly string[];
  readonly concentratedTransitionKeys: readonly string[];
  readonly newObservedBindingKeys: readonly string[];
  readonly newObservedTransitionKeys: readonly string[];
  readonly bindingDeficitReduction: number;
  readonly transitionDeficitReduction: number;
}
