import type { TokenId } from "../core/model.js";
import type {
  DiagnosticDataState,
  DiagnosticReinforcementState,
} from "./types.js";

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

const PHYSICAL_KEY_LABELS: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

export function physicalKeyLabel(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return PHYSICAL_KEY_LABELS[code] ?? code;
}

export function reinforcementStateLabel(state: DiagnosticReinforcementState): string {
  if (state === "reinforced") return "選題加權中";
  if (state === "neutral") return "目前無額外加權";
  return "尚未達選題門檻";
}
