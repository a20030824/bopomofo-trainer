import { describe, expect, it } from "vitest";
import { createCurriculumSimulationOutput } from "../../src/curriculum/cli.js";

interface CliOutput {
  readonly catalog: {
    readonly entries: number;
    readonly supportedBindings: number;
  };
  readonly reports: readonly {
    readonly scenario: string;
    readonly rounds: readonly unknown[];
  }[];
  readonly determinismCheck: {
    readonly identical: boolean;
    readonly digest: string;
  };
}

describe("curriculum simulator CLI integration", () => {
  it("runs all standard scenarios against the real catalog deterministically", async () => {
    const output = await createCurriculumSimulationOutput([
      "--seed",
      "integration",
      "--rounds",
      "2",
    ]) as CliOutput;

    expect(output.catalog.entries).toBe(50);
    expect(output.catalog.supportedBindings).toBeGreaterThan(0);
    expect(output.reports.map((report) => report.scenario)).toEqual([
      "new-learner",
      "weak-common-binding",
      "rare-unsupported-binding",
      "competing-weak-bindings",
      "cooldown-prevents-refocus",
    ]);
    expect(output.reports.every((report) => report.rounds.length === 2)).toBe(true);
    expect(output.determinismCheck.identical).toBe(true);
    expect(output.determinismCheck.digest).toMatch(/^[0-9a-f]{8}$/);
  });
});
