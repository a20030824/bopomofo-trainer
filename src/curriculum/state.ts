import type { TokenId } from "../core/model.js";
import type {
  BindingStateDecision,
  CatalogSupportIndex,
  CurriculumBindingRecord,
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

export function classifyBindingStates(
  profile: CurriculumProfile,
  support: CatalogSupportIndex,
  policy: CurriculumPolicy,
  focusedTokenId: TokenId | null = null,
): readonly BindingStateDecision[] {
  return Object.keys(support.byToken).sort(codeUnitCompare).map((tokenId) => {
    const tokenSupport = support.byToken[tokenId]!;
    const record = recordFor(profile, tokenId);
    const aggregate = record?.aggregate ?? null;
    const attempts = aggregate?.attempts ?? 0;
    const timingSamples = aggregate?.timingSamples ?? 0;

    if (focusedTokenId === tokenId) {
      return { tokenId, state: "focused", reason: "selected-for-current-round", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    if (record?.lastFocusedRound !== null && record?.lastFocusedRound !== undefined
      && profile.round - record.lastFocusedRound <= policy.cooldownRounds) {
      return { tokenId, state: "cooldown", reason: "recently-focused", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    if (attempts === 0) {
      return { tokenId, state: "unobserved", reason: "no-binding-observations", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    if (attempts < policy.minimumAttempts) {
      return { tokenId, state: "sampling", reason: "insufficient-attempts", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    if (timingSamples < policy.minimumTimingSamples) {
      return { tokenId, state: "sampling", reason: "insufficient-clean-timing", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    if (tokenSupport.entryCount < policy.minimumCatalogEntries) {
      return { tokenId, state: "sampling", reason: "insufficient-catalog-support", supportCount: tokenSupport.entryCount, attempts, timingSamples };
    }
    return { tokenId, state: "eligible", reason: "measurement-and-catalog-thresholds-met", supportCount: tokenSupport.entryCount, attempts, timingSamples };
  });
}

export function coverageTargetForToken(tokenId: TokenId, policy: CurriculumPolicy): number {
  return tokenId.startsWith("tone:") ? policy.toneCoverageTargetAttempts : policy.coverageTargetAttempts;
}
