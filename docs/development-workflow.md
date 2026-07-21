# Development workflow

## Purpose

This repository uses a local-first development workflow. GitHub Actions is a final verification aid, not a remote development environment, and product work must not automatically execute the archived relational research suite.

## Local gates

Install dependencies once for the working tree:

```bash
npm ci --include=dev --ignore-scripts
```

Before pushing an ordinary product, catalog, grammar, measurement, UI, persistence, or documentation change, run:

```bash
npm run check:pr
```

This command runs:

1. catalog generation and TypeScript typecheck;
2. all non-simulation Vitest tests;
3. catalog validation;
4. the production build.

Run the full archived research verification only when a change touches the simulation or canonical research surface, including `src/simulation/**`, `tests/simulation/**`, relational experiment scripts, experiment fixtures, or committed research findings:

```bash
npm run check:research
```

The research command is intentionally expensive. It is not a routine product merge gate.

## GitHub Actions policy

- Pull requests run only the fast `check` job.
- Pushes to `main` run only the fast `check` job.
- The `research` job runs only through `workflow_dispatch` with `run_research=true`.
- Concurrency is grouped by pull request or ref, and a newer run cancels the older run.
- The fast job has a 20-minute timeout; the manually requested research job has a 60-minute timeout.
- While hosted Actions quota is unavailable, a pull request may be reviewed and merged from recorded local verification plus diff review. Do not push repeatedly to probe CI.

## Commit and pull-request discipline

- Prepare and inspect the complete change locally before the first push.
- Prefer one logical commit. Use at most one follow-up fix commit when new evidence requires it.
- Never create `noop`, placeholder, or accidental-file commits.
- Do not use one file update as one commit when the files form one change.
- Do not push solely to discover type errors or failing tests that can be found locally.
- Keep product work separate from archived research reruns.
- Record the exact local commands and their results in the pull-request description.
- Squash merge feature branches so `main` retains one intentional commit per completed change.

## Dependency lockfile

The reviewed `package-lock.json` is the installation contract for local development and CI. Use `npm ci` for ordinary setup and verification. Update the lockfile with `npm install` only when intentionally changing dependencies, and review that change together with `package.json`.

## Actions quota exhaustion

When GitHub-hosted Actions minutes are exhausted:

1. continue development locally;
2. run `npm run check:pr` before each push;
3. batch the completed change into one push;
4. attach the local verification result to the pull request;
5. defer `check:research` unless the research surface actually changed;
6. rerun the appropriate GitHub job once quota is restored, rather than replaying every historical commit.
