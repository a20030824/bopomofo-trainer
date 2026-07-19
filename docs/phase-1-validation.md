# Phase 1 validation

The Phase 1 parser and catalog pipeline was reconstructed and executed with Node.js 22, then verified by the repository GitHub Actions workflow.

Commands:

```bash
npm install --include=dev --ignore-scripts
npm run check
npm run catalog:build
```

Observed results:

- TypeScript strict typecheck passed.
- 2 Vitest files and 9 tests passed.
- The provisional catalog compiled successfully.
- 50 entries produced 102 syllables.
- Coverage included all 37 Bopomofo symbols and all 5 explicit tone tokens.
- Generated catalog data contained semantic token IDs only; physical key codes remain in the layout module.
- A second Ministry of Education inventory audit added uncommon supported forms `ㄉㄣ`, `ㄋㄨㄣ`, `ㄌㄛ`, and `ㄌㄩㄢ`.
- The same audit removed unsupported standalone `ㄕㄨㄥ` and excluded attached-erhua-only `ㄋㄧㄚ` from the current pure-Han catalog format.

The generated JSON files are intentionally ignored. They are reproducible build outputs and can be regenerated with `npm run catalog:build`.
