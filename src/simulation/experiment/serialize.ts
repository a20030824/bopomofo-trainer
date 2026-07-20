import { stableStringify } from "../../composition/stable.js";
import type { RelationalExperimentReport } from "./types.js";

export function serializeRelationalExperimentJson(
  report: RelationalExperimentReport,
): string {
  return stableStringify(report) + "\n";
}
