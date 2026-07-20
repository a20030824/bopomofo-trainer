import { canonicalJsonDocument } from "./canonical-json.js";
import type { ReferenceImportResult } from "./types.js";

export function serializeReferenceImportResult(result: ReferenceImportResult): string {
  return canonicalJsonDocument(result);
}
