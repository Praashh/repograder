# AGENTS.md

## Overview

CLI tool that scans a codebase and scores its readiness for AI coding agents
across seven language-agnostic dimensions: test signal & CI, agent context
freshness, file/module legibility, dependency reproducibility, standards
enforcement tooling, type safety & static verification, and local
environment reproducibility.

## Build & test

- Install: `npm install`
- Build: `npm run build` (compiles TypeScript → `dist/`)
- Run: `node dist/bin/cli.js <path>`, `repograder scan <path>`, or `agent-ready scan <path>` (defaults to `.`)
- Run tests: `npm test` (builds then runs smoke test)
- Dev (watch mode): `npm run dev`
- Lint: `npm run lint` (ESLint 9 with TypeScript config)
- Format: `npm run format` (Prettier)

## Code style

- TypeScript source in `src/` and `bin/`, compiled to `dist/` via `tsc`.
- Output is CommonJS (Node16 module mode). No `"type": "module"` in package.json.
- Each scanner lives in `src/scanners/*.ts` and exports `{ id, label, scan }`.
- Shared types live in `src/types.ts` — use them; don't re-declare locally.
- `scan()` must never throw — wrap filesystem/git calls in try/catch and degrade
  to a neutral score with an evidence note instead.

## Adding a new scanner

1. Create `src/scanners/<name>.ts` following the existing shape.
2. Import and add it to the `SCANNERS` array in `src/score.ts`.
3. Scores are 1–5. The overall readiness level is the _minimum_ across all
   scanners, not an average — don't change that without discussion.

## AI Friendliness Benchmark

- `repograder benchmark [path]` measures time, tokens, compute turns, and $ cost
  to resolve 1,000 static issues across the codebase.
- Modules live in `src/benchmark/*`:
  - `costModel.ts`: analytical physics calculations derived from the 7 scanners.
  - `models.ts`: pricing registry (Claude 3.5 Sonnet, Gemini 2.0 Flash, GPT-4o, DeepSeek, local).
  - `harvester.ts`: active defect scanner (`tsc`, `eslint`) and synthetic probe generator.
  - `liveAgent.ts`: optional empirical agent probe adapter.
  - `diff.ts`: benchmark progress comparisons and delta tracking.
  - `report.ts`: terminal hero box, markdown, JSON, and compact formatters.
