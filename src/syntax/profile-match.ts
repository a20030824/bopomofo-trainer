import type {
  ProductionConstituent,
  SyntaxFeatureName,
  SyntaxFeatureSet,
  SyntaxProfile,
} from "./types.js";

const EVIDENCE_BACKED_FEATURES = new Set<SyntaxFeatureName>([
  "upos",
  "function",
  "valency",
  "surfacePosition",
  "dependencyRelation",
  "dependencyDirection",
]);

export function unsupportedProfileFeatureNames(
  features: SyntaxFeatureSet,
): readonly SyntaxFeatureName[] {
  return Object.keys(features)
    .filter((feature) => !EVIDENCE_BACKED_FEATURES.has(feature as SyntaxFeatureName))
    .sort() as SyntaxFeatureName[];
}

function featureMatches(
  profile: SyntaxProfile,
  feature: SyntaxFeatureName,
  value: string | number | boolean,
): boolean {
  switch (feature) {
    case "upos":
      return profile.upos === value;
    case "function":
      return typeof value === "string" && profile.functions.includes(value as never);
    case "valency":
      return typeof value === "string" && profile.valencyFrames.includes(value as never);
    case "dependencyRelation":
      return typeof value === "string"
        && (profile.dependencyEvidence.dependencyRelationCounts[value] ?? 0) > 0;
    case "surfacePosition":
      return typeof value === "string"
        && (profile.dependencyEvidence.surfacePositionCounts[value] ?? 0) > 0;
    case "dependencyDirection":
      return typeof value === "string"
        && (profile.dependencyEvidence.headDirectionCounts[value] ?? 0) > 0;
    default:
      // Polarity, aspect, discourse type, voice, and similar values are not
      // present in the projected evidence schema.  Failing closed prevents a
      // surface-form or dictionary-gloss guess from silently becoming syntax.
      return false;
  }
}

export function syntaxProfileMatchesRequirements(
  profile: SyntaxProfile,
  requirements: Pick<
    ProductionConstituent,
    "allowedUpos" | "requiredFunctions" | "requiredValencyFrames" | "requiredFeatures"
  >,
): boolean {
  return (requirements.allowedUpos.length === 0
      || requirements.allowedUpos.includes(profile.upos))
    && requirements.requiredFunctions.every((value) => profile.functions.includes(value))
    && (requirements.requiredValencyFrames.length === 0
      || requirements.requiredValencyFrames.some((value) => profile.valencyFrames.includes(value)))
    && Object.entries(requirements.requiredFeatures).every(([feature, value]) =>
      value !== undefined
      && featureMatches(profile, feature as SyntaxFeatureName, value)
    );
}
