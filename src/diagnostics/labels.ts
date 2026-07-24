import type { CurriculumState } from "../curriculum/types.js";
import type { TokenId } from "../core/model.js";
import type { DiagnosticDataState } from "./types.js";

export function diagnosticDataStateLabel(state: DiagnosticDataState): string {
  if (state === "sufficient") return "資料足夠";
  if (state === "preliminary") return "初步";
  return "資料不足";
}

export function tokenLabel(tokenId: TokenId): string {
  if (tokenId.startsWith("zhuyin:")) return tokenId.slice("zhuyin:".length);
  return ({
    "tone:1": "ˉ",
    "tone:2": "ˊ",
    "tone:3": "ˇ",
    "tone:4": "ˋ",
    "tone:5": "˙",
  } as Readonly<Record<string, string>>)[tokenId] ?? tokenId;
}

export function physicalKeyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function curriculumStateLabel(state: CurriculumState): string {
  switch (state) {
    case "focused":
      return "加強中";
    case "cooldown":
      return "最近已加強";
    case "eligible":
      return "可安排加強";
    case "sampling":
      return "持續蒐集資料";
    case "unobserved":
      return "尚未觀察";
  }
}

export function curriculumReasonLabel(reason: string): string {
  return ({
    "selected-for-current-round": "本輪已安排",
    "recently-focused": "最近已安排過",
    "no-binding-observations": "尚未有按鍵觀察",
    "insufficient-attempts": "嘗試次數仍不足",
    "insufficient-binding-catalog-support": "可用練習內容仍不足",
    "insufficient-clean-timing": "有效鍵間時間樣本仍不足",
    "missing-valid-current-timing": "尚未形成有效鍵間時間",
    "timed-measurement-and-catalog-thresholds-met": "量測與練習內容已達門檻",
    "correctness-measurement-and-catalog-thresholds-met": "錯誤觀察與練習內容已達門檻",
  } as Readonly<Record<string, string>>)[reason] ?? reason;
}
