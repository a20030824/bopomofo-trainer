import type { GrammarTemplate } from "./types.js";

export const DEFAULT_GRAMMAR_TEMPLATES: readonly GrammarTemplate[] = [
  {
    id: "temporal-subject-intransitive",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "predicate", role: "intransitive-predicate" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-temporal-intransitive",
    slots: [
      { key: "subject", role: "subject" },
      { key: "temporal", role: "temporal" },
      { key: "predicate", role: "intransitive-predicate" },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-transitive-object",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "predicate", role: "transitive-predicate" },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-temporal-transitive-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "temporal", role: "temporal" },
      { key: "predicate", role: "transitive-predicate" },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-transitive-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "predicate", role: "transitive-predicate" },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-modal-verb-object",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal" },
      { key: "verb", role: "verb" },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-modal-verb-object",
    slots: [
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal" },
      { key: "verb", role: "verb" },
      { key: "object", role: "object" },
    ],
    punctuation: "。",
  },
  {
    id: "temporal-subject-modal-verb",
    slots: [
      { key: "temporal", role: "temporal" },
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal" },
      { key: "verb", role: "verb" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-modal-verb",
    slots: [
      { key: "subject", role: "subject" },
      { key: "modal", role: "modal" },
      { key: "verb", role: "verb" },
    ],
    punctuation: "。",
  },
  {
    id: "subject-adjectival",
    slots: [
      { key: "subject", role: "subject" },
      { key: "predicate", role: "adjectival-predicate" },
    ],
    punctuation: "。",
  },
  {
    id: "formulaic-utterance",
    slots: [
      { key: "formulaic", role: "formulaic" },
    ],
    punctuation: "。",
  },
];
