import { describe, expect, it } from "vitest";
import {
  numberedPinyinToTrainerReading,
  PinyinConversionError,
} from "../../src/readings/pinyin-to-bopomofo.js";

describe("numberedPinyinToTrainerReading", () => {
  it("converts the current unique CC-CEDICT fallbacks", () => {
    expect(numberedPinyinToTrainerReading("Tai2 wan1")).toBe("ㄊㄞ2 ㄨㄢ1");
    expect(numberedPinyinToTrainerReading("xiang3 yao4")).toBe("ㄒㄧㄤ3 ㄧㄠ4");
    expect(numberedPinyinToTrainerReading("kan4 dao4")).toBe("ㄎㄢ4 ㄉㄠ4");
    expect(numberedPinyinToTrainerReading("ting1 dao4")).toBe("ㄊㄧㄥ1 ㄉㄠ4");
  });

  it("splits joined v2 pinyin by tone numbers", () => {
    expect(numberedPinyinToTrainerReading("hen3hao3")).toBe("ㄏㄣ3 ㄏㄠ3");
    expect(numberedPinyinToTrainerReading("dong1xi5")).toBe("ㄉㄨㄥ1 ㄒㄧ5");
  });

  it("handles y, w, apical i, and umlaut orthography", () => {
    expect(numberedPinyinToTrainerReading("yuan2 wen2")).toBe("ㄩㄢ2 ㄨㄣ2");
    expect(numberedPinyinToTrainerReading("zhi1 shi4")).toBe("ㄓ1 ㄕ4");
    expect(numberedPinyinToTrainerReading("ju4 lve4")).toBe("ㄐㄩ4 ㄌㄩㄝ4");
    expect(numberedPinyinToTrainerReading("nu:3")).toBe("ㄋㄩ3");
  });

  it("rejects unnumbered or unsupported input instead of guessing", () => {
    expect(() => numberedPinyinToTrainerReading("kan dao")).toThrow(PinyinConversionError);
    expect(() => numberedPinyinToTrainerReading("hm2")).toThrow(PinyinConversionError);
  });
});
