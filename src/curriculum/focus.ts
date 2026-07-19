import type { TokenId } from "../core/model.js";
import { coverageTargetForToken, classifyBindingStates } from "./state.js";
import type {
  CatalogSupportIndex,
  CurriculumPolicy,
  CurriculumProfile,
  FocusScore,
  FocusSelection,
} from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function selectCurriculumFocus(
  profile: CurriculumProfile,
  support: CatalogSupportIndex,
  policy: CurriculumPolicy,
): FocusSelection {
  const initialStates = classifyBindingStates(profile, support, policy);
  const coverageCandidates = initialStates
    .filter((state) => state.state !== "cooldown")
    .filter((state) => state.supportCount >= policy.minimumCatalogEntries)
    .filter((state) => state.attempts < coverageTargetForToken(state.tokenId, policy))
    .sort((left, right) => {
      const leftTarget = coverageTargetForToken(left.tokenId, policy);
      const rightTarget = coverageTargetForToken(right.tokenId, policy);
      const leftUrgency = (leftTarget - left.attempts) / leftTarget;
      const rightUrgency = (rightTarget - right.attempts) / rightTarget;
      if (leftUrgency !== rightUrgency) return rightUrgency - leftUrgency;
      const leftSupport = support.byToken[left.tokenId]!.commonEntryCount * 1000 + left.supportCount;
      const rightSupport = support.byToken[right.tokenId]!.commonEntryCount * 1000 + right.supportCount;
      if (leftSupport !== rightSupport) return rightSupport - leftSupport;
      return codeUnitCompare(left.tokenId, right.tokenId);
    });
  if (coverageCandidates.length > 0) {
    const selected = coverageCandidates[0]!;
    return {
      phase: "coverage",
      tokenId: selected.tokenId,
      reason: "baseline-coverage-deficit",
      candidates: coverageCandidates.map((candidate) => ({
        tokenId: candidate.tokenId,
        errorRate: 0,
        timingRatio: 0,
        score: (coverageTargetForToken(candidate.tokenId, policy) - candidate.attempts)
          / coverageTargetForToken(candidate.tokenId, policy),
        supportCount: candidate.supportCount,
      })),
    };
  }

  const eligible = initialStates.filter((state) => state.state === "eligible");
  const maximumTiming = Math.max(
    1,
    ...eligible.map((state) => profile.bindings[state.tokenId]?.aggregate?.currentTimeToTypeMs ?? 0),
  );
  const totalWeight = policy.errorWeight + policy.timingWeight;
  const scores: FocusScore[] = eligible.map((state) => {
    const aggregate = profile.bindings[state.tokenId]!.aggregate!;
    const errorRate = aggregate.attempts === 0 ? 0 : aggregate.errors / aggregate.attempts;
    const timingRatio = (aggregate.currentTimeToTypeMs ?? 0) / maximumTiming;
    return {
      tokenId: state.tokenId,
      errorRate,
      timingRatio,
      score: (errorRate * policy.errorWeight + timingRatio * policy.timingWeight) / totalWeight,
      supportCount: state.supportCount,
    };
  }).sort((left, right) => right.score - left.score || codeUnitCompare(left.tokenId, right.tokenId));

  return {
    phase: "adaptive",
    tokenId: scores[0]?.tokenId ?? null,
    reason: scores.length === 0 ? "no-eligible-binding" : "highest-explainable-weakness-score",
    candidates: scores,
  };
}
