import type {
  RedistributionStatus,
  ReferenceSourceManifest,
} from "./types.js";

const REDISTRIBUTION = new Set<RedistributionStatus>([
  "redistributable",
  "local-only",
  "unconfirmed",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function url(value: unknown, label: string): string {
  const source = text(value, label);
  const parsed = new URL(source);
  if (parsed.protocol !== "https:") {
    throw new TypeError(`${label} must use https`);
  }
  return source;
}

function nullableUrl(value: unknown, label: string): string | null {
  return value === null ? null : url(value, label);
}

function stringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${label} must be a string array`);
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

function retrievalDate(value: unknown, label: string): string | null {
  const source = nullableText(value, label);
  if (source === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(source)) {
    throw new TypeError(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${source}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== source) {
    throw new TypeError(`${label} must be a real calendar date`);
  }
  return source;
}

function manifest(value: unknown, index: number): ReferenceSourceManifest {
  const source = record(value, `source manifest ${index}`);
  const redistributionStatus = text(
    source.redistributionStatus,
    `source manifest ${index}.redistributionStatus`,
  );
  if (!REDISTRIBUTION.has(redistributionStatus as RedistributionStatus)) {
    throw new TypeError(`source manifest ${index}.redistributionStatus is invalid`);
  }
  const checksumSha256 = nullableText(
    source.checksumSha256,
    `source manifest ${index}.checksumSha256`,
  );
  if (checksumSha256 !== null && !/^[0-9a-f]{64}$/u.test(checksumSha256)) {
    throw new TypeError(`source manifest ${index}.checksumSha256 must be lowercase SHA-256`);
  }

  return {
    id: text(source.id, `source manifest ${index}.id`),
    title: text(source.title, `source manifest ${index}.title`),
    version: text(source.version, `source manifest ${index}.version`),
    homepageUrl: url(source.homepageUrl, `source manifest ${index}.homepageUrl`),
    downloadUrl: nullableUrl(source.downloadUrl, `source manifest ${index}.downloadUrl`),
    retrievedAt: retrievalDate(
      source.retrievedAt,
      `source manifest ${index}.retrievedAt`,
    ),
    checksumSha256,
    licenseLabel: text(source.licenseLabel, `source manifest ${index}.licenseLabel`),
    redistributionStatus: redistributionStatus as RedistributionStatus,
    notes: stringList(source.notes, `source manifest ${index}.notes`),
  };
}

export function parseReferenceSourceManifests(
  value: unknown,
): readonly ReferenceSourceManifest[] {
  if (!Array.isArray(value)) {
    throw new TypeError("reference source manifests must be an array");
  }
  return value.map(manifest);
}
