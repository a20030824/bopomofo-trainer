import type { TokenId } from "../core/model.js";
import type {
  BindingStateDecision,
  CatalogSupportIndex,
  CurriculumBindingRecord,
  CurriculumEvidence,
  CurriculumPolicy,
  CurriculumProfile,
} from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function recordFor(profile: CurriculumProfile, tokenId: TokenId): CurriculumBindingRecord | null {
  const record = profile.bindings[tokenId];
  if (record === undefined) return null;
  if (record.scope.mode !== profile.mode || record.scope.layoutId !== profile.layoutId) {
    throw new Error(`binding ${tokenId} does not match the profile scope`);
  }
  return record;
}

function availableEvidence(
  motorSupportCount: number,
  policy: CurriculumPolicy,
): CurriculumEvidence {
  return motorSupportCount >= policy.minimumCatalogEntries
    ? "timed"
    : "correctness-only";
}

export function classifyBindingStates(
  profile: CurriculumProfile,
  support: CatalogSupportIndex,
  policy: CurriculumPolicy,
  focusedTokenId: TokenId | null = null,
): readonly BindingStateDecision[] {
  return Object.keys(support.byToken).sort(codeUnitCompare).map((tokenId) => {
    const tokenSupport = support.byToken[tokenId]!;
    const evidence = availableEvidence(tokenSupport.motorEntryCount, policy);
    const supportCount = evidence === "timed"
      ? tokenSupport.motorEntryCount
      : tokenSupport.bindingEntryCount;
    const record = recordFor(profile, tokenId);
    const aggregate = record?.aggregate ?? null;
    const attempts = aggregate?.attempts ?? 0;
    const timingSamples = aggregate?.timingSamples ?? 0;
    const base = {
      tokenId,
      evidence,
      supportCount,
      bindingSupportCount: tokenSupport.bindingEntryCount,
      motorSupportCount: tokenSupport.motorEntryCount,
      attempts,
      timingSamples,
    } as const;

    if (focusedTokenId === tokenId) {
      return { ...base, state: "focused", reason: "selected-for-current-round" };
    }
    if (record?.lastFocusedRound !== null && record?.lastFocusedRound !== undefined
      && profile.round - record.lastFocusedRound <= policy.cooldownRounds) {
      return { ...base, state: "cooldown", reason: "recently-focused" };
    }
    if (attempts === 0) {
      return { ...base, state: "unobserved", reason: "no-binding-observations" };
    }
    if (attempts < policy.minimumAttempts) {
      return { ...base, state: "sampling", reason: "insufficient-attempts" };
    }
    if (tokenSupport.bindingEntryCount < policy.minimumCatalogEntries) {
      return { ...base, state: "sampling", reason: "insufficient-binding-catalog-support" };
    }
    if (evidence === "timed") {
      if (timingSamples < policy.minimumTimingSamples) {
        return { ...base, state: "sampling", reason: "insufficient-clean-timing" };
      }
      if (aggregate?.currentTimeToTypeMs === null
        || aggregate?.currentTimeToTypeMs === undefined
        || !Number.isFinite(aggregate.currentTimeToTypeMs)
        || aggregate.currentTimeToTypeMs < 0) {
        return { ...base, state: "sampling", reason: "missing-valid-current-timing" };
      }
    }
    return {
      ...base,
      state: "eligible",
      reason: evidence === "timed"
        ? "timed-measurement-and-catalog-thresholds-met"
        : "correctness-measurement-and-catalog-thresholds-met",
    };
  });
}

export function coverageTargetForToken(tokenId: TokenId, policy: CurriculumPolicy): number {
  return tokenId.startsWith("tone:")
    ? policy.toneCoverageTargetAttempts
    : policy.coverageTargetAttempts;
}
