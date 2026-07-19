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
    .filter((state) => state.bindingSupportCount >= policy.minimumCatalogEntries)
    .filter((state) => state.attempts < coverageTargetForToken(state.tokenId, policy))
    .sort((left, right) => {
      const leftTarget = coverageTargetForToken(left.tokenId, policy);
      const rightTarget = coverageTargetForToken(right.tokenId, policy);
      const leftUrgency = (leftTarget - left.attempts) / leftTarget;
      const rightUrgency = (rightTarget - right.attempts) / rightTarget;
      if (leftUrgency !== rightUrgency) return rightUrgency - leftUrgency;
      const leftSupport = support.byToken[left.tokenId]!.commonBindingEntryCount * 1000
        + left.bindingSupportCount;
      const rightSupport = support.byToken[right.tokenId]!.commonBindingEntryCount * 1000
        + right.bindingSupportCount;
      if (leftSupport !== rightSupport) return rightSupport - leftSupport;
      return codeUnitCompare(left.tokenId, right.tokenId);
    });
  if (coverageCandidates.length > 0) {
    const selected = coverageCandidates[0]!;
    return {
      phase: "coverage",
      tokenId: selected.tokenId,
      evidence: selected.evidence,
      reason: "baseline-coverage-deficit",
      candidates: coverageCandidates.map((candidate) => ({
        tokenId: candidate.tokenId,
        evidence: candidate.evidence!,
        errorRate: 0,
        timingRatio: null,
        score: (coverageTargetForToken(candidate.tokenId, policy) - candidate.attempts)
          / coverageTargetForToken(candidate.tokenId, policy),
        supportCount: candidate.supportCount,
      })),
    };
  }

  const eligible = initialStates.filter((state) => state.state === "eligible");
  const timed = eligible.filter((state) => state.evidence === "timed");
  const maximumTiming = Math.max(
    1,
    ...timed.map((state) =>
      profile.bindings[state.tokenId]!.aggregate!.currentTimeToTypeMs!,
    ),
  );
  const scores: FocusScore[] = eligible.map((state) => {
    const aggregate = profile.bindings[state.tokenId]!.aggregate!;
    const errorRate = aggregate.attempts === 0 ? 0 : aggregate.errors / aggregate.attempts;
    const timingRatio = state.evidence === "timed"
      ? aggregate.currentTimeToTypeMs! / maximumTiming
      : null;
    const timingContribution = timingRatio === null ? 0 : timingRatio * policy.timingWeight;
    const denominator = policy.errorWeight
      + (timingRatio === null ? 0 : policy.timingWeight);
    return {
      tokenId: state.tokenId,
      evidence: state.evidence!,
      errorRate,
      timingRatio,
      score: (errorRate * policy.errorWeight + timingContribution) / denominator,
      supportCount: state.supportCount,
    };
  }).sort((left, right) =>
    right.score - left.score || codeUnitCompare(left.tokenId, right.tokenId),
  );

  return {
    phase: "adaptive",
    tokenId: scores[0]?.tokenId ?? null,
    evidence: scores[0]?.evidence ?? null,
    reason: scores.length === 0
      ? "no-eligible-binding"
      : "highest-explainable-weakness-score",
    candidates: scores,
  };
}
