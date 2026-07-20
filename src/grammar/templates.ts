import type { GrammarTemplate } from "./types.js";

const INTRANSITIVE_FRAMES = ["intransitive", "ambitransitive"] as const;
const TRANSITIVE_FRAMES = ["transitive", "ambitransitive"] as const;

export const DEFAULT_GRAMMAR_TEMPLATES: readonly GrammarTemplate[] = [
  {
    id: "temporal-subject-intransitive",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "predicate", role: "intransitive-predicate", predicateFrames: INTRANSITIVE_FRAMES },
    ],
    punctuation: "。",
  },
  {
    id: "subject-temporal-intransitive",
    slots: [
      { key: "subject", role: "subject" },
      { key: "temporal", role: "temporal" },
      { key: "predicate", role: "intransitive-predicate", predicateFrames: INTRANSITIVE_FRAMES },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-transitive-object",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "predicate", role: "transitive-predicate", predicateFrames: TRANSITIVE_FRAMES },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-temporal-transitive-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "temporal", role: "temporal" },
      { key: "predicate", role: "transitive-predicate", predicateFrames: TRANSITIVE_FRAMES },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-transitive-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "predicate", role: "transitive-predicate", predicateFrames: TRANSITIVE_FRAMES },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-modal-verb-object",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal", predicateFrames: ["modal"] },
      { key: "verb", role: "verb", predicateFrames: TRANSITIVE_FRAMES },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-modal-verb-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal", predicateFrames: ["modal"] },
      { key: "verb", role: "verb", predicateFrames: TRANSITIVE_FRAMES },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-modal-verb",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal", predicateFrames: ["modal"] },
      { key: "verb", role: "verb", predicateFrames: INTRANSITIVE_FRAMES },
    ],
    punctuation: "。",
  },
  {
    id: "subject-modal-verb",
    slots: [
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal", predicateFrames: ["modal"] },
      { key: "verb", role: "verb", predicateFrames: INTRANSITIVE_FRAMES },
    ],
    punctuation: "。",
  },
  {
    id: "subject-adjectival",
    slots: [
      { key: "subject", role: "subject" },
      { key: "predicate", role: "adjectival-predicate", predicateFrames: ["adjectival"] },
    ],
    punctuation: "。",
  },
  {
    id: "formulaic-utterance",
    slots: [
      { key: "formulaic", role: "formulaic", predicateFrames: ["none"] },
    ],
    punctuation: "。",
  },
];
