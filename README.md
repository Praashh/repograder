# repograder

> Score how ready a codebase is for AI coding agents to work in — language-agnostic, zero-config, fast, and deterministic.

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/Praashh/repograder/actions)
[![Agent Readiness](<https://img.shields.io/badge/agent%20readiness-Autonomous--ready%20(5%2F5)-brightgreen>)](https://github.com/Praashh/repograder)

AI coding agents (like Claude Code, Cursor, Copilot Workspace, Codex, Devin) struggle or fail silently when a codebase lacks test harnesses, stale documentation, monster files, or missing linters.

**`repograder`** evaluates your repository across 6 fundamental dimensions, detects potential failure modes, outputs a readiness scorecard with a granular **Readiness Index (0–100)**, and generates actionable, copy-pasteable remediation commands.

---

## Quick Start

Run instantly without installation:

```bash
npx repograder
```

Or install globally:

```bash
npm install -g repograder
```

---

## Usage

```bash
# Scan the current repository
repograder

# Explicit scan subcommand
repograder scan

# Scaffold a tailored AGENTS.md for your stack
repograder init

# Scan another directory or project
repograder scan ../my-service

# Output GitHub Actions-ready Markdown (ideal for $GITHUB_STEP_SUMMARY)
repograder --markdown >> $GITHUB_STEP_SUMMARY

# Output machine-readable JSON (useful for CI/CD pipelines)
repograder --json > report.json

# Fail CI pipeline if readiness level is below threshold
repograder --fail-under 4

# Output Shields.io badge schema
repograder --badge
```

### Options & Subcommands

| Command / Flag       | Description                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `[path]`             | Path to repository to scan (defaults to current directory `.`)                             |
| `init [path]`        | Scaffold a tailored `AGENTS.md` context file based on detected tools and package manifests |
| `--format <type>`    | Output format: `text` (default), `json`, `markdown`, `badge`                               |
| `--markdown`, `--md` | Shorthand for `--format markdown`                                                          |
| `--json`             | Shorthand for `--format json`                                                              |
| `--badge`            | Output Shields.io badge endpoint JSON schema                                               |
| `--fail-under <1-5>` | Exit with code 1 if ceiling readiness score is below this threshold                        |
| `--force`, `-f`      | Overwrite existing `AGENTS.md` when running `init`                                         |
| `-h, --help`         | Show usage help and options                                                                |

---

## Active Scaffolding (`repograder init`)

Don't have an `AGENTS.md` yet? Run:

```bash
repograder init
```

`repograder` inspects your repository, detects your package managers, test runners, build scripts, and linters, and scaffolds a tailored, battle-tested `AGENTS.md` specifying:

- One-click build and test commands
- Coding conventions and modularity guidelines
- Essential agent operating rules

---

## CI / CD Integration

`repograder` is designed to run natively as a CI gate. By default, it exits with **code 1** if the codebase scores at Level 1 (**Not agent-ready**), and **code 0** otherwise. Use `--fail-under` to raise the bar for your team.

### GitHub Actions Example

```yaml
name: Agent Readiness Gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  agent-grade:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      # Post rich markdown summary directly into the GitHub Actions run summary
      - run: npx repograder --markdown >> $GITHUB_STEP_SUMMARY
      # Fail PR if readiness score drops below Capable (4/5)
      - run: npx repograder --fail-under 4
```

---

## Roadmap & Future Goals

### Core Scanners & Engine

- [x] Auto-scaffold tailored `AGENTS.md` via `repograder init`
- [x] Multi-agent modern rule detection (`.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurfrules`)
- [x] Dedicated Type Safety & Static Verification scanner (`tsconfig.json`, `mypy`, `pyright`, Rust, Go)
- [ ] Local environment reproducibility scanner (devcontainers, `Dockerfile`, `.nvmrc`, `.python-version`)
- [x] Monorepo & multi-package workspace support (pnpm workspaces, Turborepo, Cargo workspaces)
- [ ] Interactive remediation (`repograder fix`) to auto-create missing `.env.example`, `.gitignore` entries, and stubs

### CLI & Configuration

- [x] Configurable CI thresholds (`--fail-under <1-5>`)
- [x] Rich Markdown export for GitHub Actions summaries (`--markdown`)
- [x] Shields.io endpoint badge generator (`--badge`)
- [ ] Custom configuration (`repograder.config.json` / `--config`) for per-project thresholds and rules
- [ ] SARIF & Code Climate export formats (`--format sarif`) for GitHub Code Scanning integration

### CI/CD & Integrations

- [ ] GitHub Action bot to post scorecard diffs and regressions directly on pull requests
- [ ] Pre-commit hook plugin (`repograder` git hook integration)
- [ ] Slack / Discord webhook alerting for repository readiness drops

---

## License

[MIT](LICENSE)
