import type { TokenId } from "../core/model.js";
import type {
  ConfusionDiagnostic,
  TransitionDiagnostic,
} from "../diagnostics/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../scheme/standard-layout.js";
import {
  KEYBOARD_GEOMETRY_ROWS,
  keyboardColumnSpan,
} from "./keyboard-geometry.js";

export type DiagnosticRelationshipRow = TransitionDiagnostic | ConfusionDiagnostic;
export type DiagnosticRelationshipKind = "transition" | "confusion";

export interface DiagnosticKeyboardPoint {
  readonly x: number;
  readonly y: number;
}

export interface DiagnosticRelationshipPath {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly width: number;
  readonly opacity: number;
  readonly selected: boolean;
  readonly includesTone: boolean;
}

const KEYBOARD_COLUMNS = 60;
const KEYBOARD_ROWS = 5;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function diagnosticKeyboardPoints(): ReadonlyMap<TokenId, DiagnosticKeyboardPoint> {
  const result = new Map<TokenId, DiagnosticKeyboardPoint>();
  KEYBOARD_GEOMETRY_ROWS.forEach((row, rowIndex) => {
    let column = 0;
    for (const key of row) {
      const span = keyboardColumnSpan(key);
      const tokenId = STANDARD_BOPOMOFO_LAYOUT.bindings[key.code];
      if (tokenId !== undefined) {
        result.set(tokenId, {
          x: column + span / 2,
          y: rowIndex + 0.5,
        });
      }
      column += span;
    }
    if (column !== KEYBOARD_COLUMNS) {
      throw new Error(`keyboard row ${rowIndex} spans ${column}, expected ${KEYBOARD_COLUMNS}`);
    }
  });
  return result;
}

function relationTokens(
  kind: DiagnosticRelationshipKind,
  row: DiagnosticRelationshipRow,
): readonly [TokenId, TokenId] {
  if (kind === "transition" && "fromTokenId" in row) {
    return [row.fromTokenId, row.toTokenId];
  }
  if (kind === "confusion" && "expectedTokenId" in row) {
    return [row.expectedTokenId, row.actualTokenId];
  }
  throw new TypeError(`relationship row does not match ${kind}`);
}

function relationLabel(
  kind: DiagnosticRelationshipKind,
  row: DiagnosticRelationshipRow,
): string {
  if (kind === "transition" && "fromSymbol" in row) {
    return `${row.fromSymbol} 到 ${row.toSymbol}，${Math.round(row.timingMs)} 毫秒，${row.timingSamples} 個樣本`;
  }
  if (kind === "confusion" && "expectedSymbol" in row) {
    return `應按 ${row.expectedSymbol}，按成 ${row.actualSymbol}，${row.occurrences} 次`;
  }
  throw new TypeError(`relationship row does not match ${kind}`);
}

function relationWidth(kind: DiagnosticRelationshipKind, row: DiagnosticRelationshipRow): number {
  const samples = kind === "transition" && "timingSamples" in row
    ? row.timingSamples
    : "occurrences" in row
      ? row.occurrences
      : 1;
  if (samples >= 8) return 2;
  if (samples >= 5) return 1.65;
  if (samples >= 3) return 1.35;
  return 1.1;
}

function relationshipPath(
  id: string,
  from: DiagnosticKeyboardPoint,
  to: DiagnosticKeyboardPoint,
  includesTone: boolean,
): string {
  const lane = stableHash(id) % 4;
  const xDistance = Math.abs(to.x - from.x);
  if (Math.abs(to.x - from.x) < 0.01) {
    const side = stableHash(`${id}:side`) % 2 === 0 ? -1 : 1;
    const controlX = from.x + side * (2.2 + lane * 0.55);
    return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${controlX.toFixed(2)} ${from.y.toFixed(2)}, ${controlX.toFixed(2)} ${to.y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  }

  const baseRise = includesTone ? 1.15 : 0.62 + Math.min(1.05, xDistance / 22);
  const laneRise = lane * (includesTone ? 0.18 : 0.14);
  const controlY = Math.min(from.y, to.y) - baseRise - laneRise;
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${from.x.toFixed(2)} ${controlY.toFixed(2)}, ${to.x.toFixed(2)} ${controlY.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}

export function buildDiagnosticRelationshipPaths(
  kind: DiagnosticRelationshipKind,
  rows: readonly DiagnosticRelationshipRow[],
  selectedId: string | null,
): readonly DiagnosticRelationshipPath[] {
  const points = diagnosticKeyboardPoints();
  const maximumRank = Math.max(1, rows.length - 1);
  return rows.flatMap((row, index) => {
    const [fromTokenId, toTokenId] = relationTokens(kind, row);
    const from = points.get(fromTokenId);
    const to = points.get(toTokenId);
    if (from === undefined || to === undefined) return [];
    const includesTone = fromTokenId.startsWith("tone:") || toTokenId.startsWith("tone:");
    return [{
      id: row.id,
      path: relationshipPath(row.id, from, to, includesTone),
      label: relationLabel(kind, row),
      width: relationWidth(kind, row),
      opacity: Math.max(0.28, 0.72 - (index / maximumRank) * 0.34),
      selected: selectedId === row.id,
      includesTone,
    }];
  });
}

export const DIAGNOSTIC_RELATIONSHIP_VIEWBOX = Object.freeze({
  minX: 0,
  minY: 0,
  width: KEYBOARD_COLUMNS,
  height: KEYBOARD_ROWS,
});
