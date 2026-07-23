# Grammar-aware practice

New sentence generation is defined by [`formal-syntax-system.md`](formal-syntax-system.md). The repository has no built-in list of complete sentence templates.

The legacy `GrammarTemplate`, `composeGrammarCandidates`, and slot-weighted compatibility APIs remain only for callers that explicitly provide their own templates. With no explicit templates they can return reviewed standalone utterances or lexical prompts; they cannot invent a multi-word sequence.

For large lexical batches, run:

```sh
npm run lexicon:generation-pipeline
```

The pipeline projects manifest-linked UD evidence into multiple `SyntaxProfile` records per word and builds a fixed-point formal-rule index. It handles 10,000 candidates without materializing sentence combinations. Every row records whether it reaches a complete `Sentence` rule, lacks a compatible lexical position, or has no UD evidence.

Website packaging uses that index as a hard gate. Run
`npm run app:syntax-legality` after regenerating the top-10,000 index; it writes
a compact active-catalog allowlist plus runtime-only syntax profiles.
`npm run app:catalog` accepts only entries marked `indexed`, verifies both
artifacts against the exact catalog and source lineage digests, and fails
instead of packaging from stale, incomplete, or partially profiled data.

The browser samples a bounded formal `Sentence` derivation first. Each lexical
slot is then filled only from compatible runtime profiles, with reviewed
commonness, bounded learner evidence, and repetition penalties applied inside
that compatible set. Caller-supplied template and standalone fallbacks remain
compatibility APIs only and are not reachable from the product session.

The system is intentionally syntax-only. It does not use definitions, meanings, embeddings, collocation scores, LLM judgments, or guessed parts of speech.
