import { describe, expect, it } from "vitest";
import {
  diagnosticDataStateLabel,
  physicalKeyLabel,
  tokenLabel,
} from "../../src/diagnostics/labels.js";

describe("diagnostic labels", () => {
  it("uses user-facing Zhuyin and physical key labels", () => {
    expect(tokenLabel("zhuyin:ㄢ")).toBe("ㄢ");
    expect(tokenLabel("tone:2")).toBe("ˊ");
    expect(physicalKeyLabel("Digit0")).toBe("0");
    expect(physicalKeyLabel("KeyJ")).toBe("J");
    expect(physicalKeyLabel("Semicolon")).toBe(";");
    expect(physicalKeyLabel("Slash")).toBe("/");
    expect(physicalKeyLabel("Space")).toBe("Space");
  });

  it("keeps conservative data-state wording", () => {
    expect(diagnosticDataStateLabel("insufficient")).toBe("資料不足");
    expect(diagnosticDataStateLabel("preliminary")).toBe("初步");
    expect(diagnosticDataStateLabel("sufficient")).toBe("資料足夠");
  });
});
