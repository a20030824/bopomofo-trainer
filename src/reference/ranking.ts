import type { RelationalCatalogReport } from "../relations/catalog-report.js";
import { analyzeReferenceContribution } from "./contribution.js";
import { candidateSemanticIdentity } from "./identity.js";
import type {
  RankedReferenceCandidate,
  ReferenceRankComponents,
  ReferenceRankingProfile,
  ReferenceReviewExclusion,
  ReferenceReviewQueue,
} from "./ranking-types.js";
import type { ReferenceCandidate } from "./types.js";

export interface ReferenceRankingOptions {
  readonly reviewedIdentities: ReadonlySet<string>;
  readonly excludedCandidateIds?: ReadonlySet<string>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function componentsFor(
  candidate: ReferenceCandidate,
  contribution: ReturnType<typeof analyzeReferenceContribution>,
): ReferenceRankComponents {
  return {
    partitionRepairBindingCount: contribution.partitionRepairBindingKeys.length,
    partitionRepairTransitionCount: contribution.partitionRepairTransitionKeys.length,
    rareOnlyBindingCount: contribution.rareOnlyBindingKeys.length,
    rareOnlyTransitionCount: contribution.rareOnlyTransitionKeys.length,
    bindingDeficitReduction: contribution.bindingDeficitReduction,
    transitionDeficitReduction: contribution.transitionDeficitReduction,
    newObservedBindingCount: contribution.newObservedBindingKeys.length,
    newObservedTransitionCount: contribution.newObservedTransitionKeys.length,
    oralPerMillion: candidate.oralPerMillion,
    writtenPerMillion: candidate.writtenPerMillion,
    levelOrdinal: candidate.levelOrdinal,
    tokenCount: candidate.tokenCount,
  };
}

function commonTail(components: ReferenceRankComponents): readonly number[] {
  return [
    components.oralPerMillion ?? -1,
    components.writtenPerMillion ?? -1,
    components.levelOrdinal === null ? -1_000_000 : -components.levelOrdinal,
    -components.tokenCount,
  ];
}

function priorityVector(
  profile: ReferenceRankingProfile,
  components: ReferenceRankComponents,
): readonly number[] {
  const bindingRepair = components.partitionRepairBindingCount;
  const transitionRepair = components.partitionRepairTransitionCount;
  const bindingRare = components.rareOnlyBindingCount;
  const transitionRare = components.rareOnlyTransitionCount;
  const bindingDeficit = components.bindingDeficitReduction;
  const transitionDeficit = components.transitionDeficitReduction;
  const newBinding = components.newObservedBindingCount;
  const newTransition = components.newObservedTransitionCount;

  if (profile === "partition-repair") {
    return [
      bindingRepair + transitionRepair,
      transitionRepair,
      bindingRepair,
      bindingRare + transitionRare,
      bindingDeficit + transitionDeficit,
      newBinding + newTransition,
      ...commonTail(components),
    ];
  }
  if (profile === "binding-broadening") {
    return [
      bindingRepair,
      bindingRare,
      bindingDeficit,
      newBinding,
      transitionRepair,
      transitionRare,
      transitionDeficit,
      newTransition,
      ...commonTail(components),
    ];
  }
  if (profile === "transition-broadening") {
    return [
      transitionRepair,
      transitionRare,
      transitionDeficit,
      newTransition,
      bindingRepair,
      bindingRare,
      bindingDeficit,
      newBinding,
      ...commonTail(components),
    ];
  }
  return [
    bindingRepair + transitionRepair,
    bindingRare + transitionRare,
    bindingDeficit + transitionDeficit,
    newBinding + newTransition,
    transitionRepair,
    transitionDeficit,
    bindingRepair,
    bindingDeficit,
    ...commonTail(components),
  ];
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function buildReferenceReviewQueue(
  candidates: readonly ReferenceCandidate[],
  report: RelationalCatalogReport,
  profile: ReferenceRankingProfile,
  options: ReferenceRankingOptions,
): ReferenceReviewQueue {
  const excludedCandidateIds = options.excludedCandidateIds ?? new Set<string>();
  const seenIds = new Set<string>();
  const seenIdentities = new Set<string>();
  const ranked: Omit<RankedReferenceCandidate, "rank">[] = [];
  const excluded: ReferenceReviewExclusion[] = [];

  for (const candidate of [...candidates].sort((left, right) => compareText(left.id, right.id))) {
    const identity = candidateSemanticIdentity(candidate);
    if (seenIds.has(candidate.id)) {
      excluded.push({
        candidateId: candidate.id,
        reason: "duplicate-candidate-id",
        detail: "candidate id appeared more than once in the reference input",
      });
      continue;
    }
    seenIds.add(candidate.id);
    if (seenIdentities.has(identity)) {
      excluded.push({
        candidateId: candidate.id,
        reason: "duplicate-reference-identity",
        detail: "another reference row has the same text and semantic reading",
      });
      continue;
    }
    seenIdentities.add(identity);
    if (options.reviewedIdentities.has(identity)) {
      excluded.push({
        candidateId: candidate.id,
        reason: "already-reviewed",
        detail: "text and semantic reading already exist in the reviewed catalog",
      });
      continue;
    }
    if (excludedCandidateIds.has(candidate.id)) {
      excluded.push({
        candidateId: candidate.id,
        reason: "policy-excluded",
        detail: "candidate id is excluded by review policy",
      });
      continue;
    }

    const contribution = analyzeReferenceContribution(candidate, report);
    const components = componentsFor(candidate, contribution);
    ranked.push({
      candidate,
      contribution,
      profile,
      components,
      priorityVector: priorityVector(profile, components),
    });
  }

  ranked.sort((left, right) =>
    compareVectors(left.priorityVector, right.priorityVector)
    || compareText(left.candidate.id, right.candidate.id),
  );

  return {
    profile,
    ranked: ranked.map((candidate, index) => ({ ...candidate, rank: index + 1 })),
    excluded: excluded.sort((left, right) =>
      compareText(left.candidateId, right.candidateId)
      || compareText(left.reason, right.reason),
    ),
  };
}
