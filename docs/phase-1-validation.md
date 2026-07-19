# Phase 1 validation

The Phase 1 parser and catalog pipeline was reconstructed and executed locally with Node.js 22.

Commands:

```bash
npm install --include=dev --ignore-scripts
npm run check
npm run catalog:build
```

Observed results:

- TypeScript strict typecheck passed.
- 2 Vitest files and 7 tests passed.
- The provisional catalog compiled successfully.
- 50 entries produced 102 syllables.
- Coverage included all 37 Bopomofo symbols and all 5 explicit tone tokens.
- Generated catalog data contained semantic token IDs only; physical key codes remain in the layout module.

The generated JSON files are intentionally ignored. They are reproducible build outputs and can be regenerated with `npm run catalog:build`.
