# repograder

> Score how ready a codebase is for AI coding agents to work in — language-agnostic, zero-config, fast, and deterministic.

AI coding agents (like Claude Code, Cursor, Copilot Workspace, Codex, Devin) struggle or fail silently when a codebase lacks test harnesses, stale documentation, monster files, or missing linters. 

**`repograder`** evaluates your repository across 5 fundamental dimensions, detects potential failure modes, and outputs a readiness scorecard with an actionable remediation priority list.

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

*(Also available via alias command: `agent-ready`)*

---

## Usage

```bash
# Scan the current repository
repograder

# Explicit scan subcommand
repograder scan

# Scan another directory or project
repograder scan ../my-service

# Output machine-readable JSON (useful for CI/CD pipelines)
repograder --json > report.json
```

### Options

| Flag | Description |
|---|---|
| `[path]` | Path to repository to scan (defaults to current directory `.`) |
| `--json` | Output machine-readable JSON instead of console report |
| `-h, --help` | Show usage help and options |

---

## Example Output

```text
Agent Readiness Scan  /path/to/my-project

Readiness level: Supervised (3/5)  — set by lowest-scoring dimension, not the average

  █████  5/5  Test signal & CI [blocking]
        Found test directory: test
        Found CI workflow: .github/workflows/ci.yml
        CI executes test suites

  ███░░  3/5  Agent context freshness 
        Found AGENTS.md (modified 18 days ago)
        Substantive context provided (45 lines)

  ████░  4/5  File & module legibility 
        Median source file: 64 lines (p90: 210 lines)
        Max file length: 340 lines (within recommended bounds)

  ███░░  3/5  Dependency reproducibility 
        Found package-lock.json
        No automated dependency update bot configuration detected

  █████  5/5  Standards enforcement tooling 
        Linter configured: eslint
        Pre-commit hooks detected: .husky

Priority order for improvement:
  1. Agent context freshness (currently 3/5)
  2. Dependency reproducibility (currently 3/5)
```

---

## How Scoring Works

### The Weakest Link Principle
The overall readiness score is the **minimum across all dimensions, not an average**. 

An AI coding agent fails at the weakest link: a repository with clean modular code and great documentation will still fail if there are no tests for the agent to verify its changes against.

### Readiness Levels

| Level | Score | What it means for AI agents |
|---|:---:|---|
| **Autonomous-ready** | 5/5 | Agents can reliably plan, edit, run tests, and iterate with minimal supervision. |
| **Capable** | 4/5 | Agents work well for most scoped tasks; minor context or tooling gaps. |
| **Supervised** | 3/5 | Agents need human guidance and close review before merging changes. |
| **Fragile** | 2/5 | High risk of hallucinated edits, broken builds, or regressions. |
| **Not agent-ready** | 1/5 | Critical blocking gaps (e.g. no tests or verifiable execution signal). |

---

## The 5 Dimensions

| Dimension | Criticality | What it inspects |
|---|:---:|---|
| **Test signal & CI** | **Blocking** | Unit/integration test suites present; CI workflows detected that execute tests. |
| **Agent context freshness** | Standard | `AGENTS.md`, `CLAUDE.md`, or repository instructions present, recent, and substantive. |
| **File & module legibility** | Standard | Source file length distribution (median, p90, max). Flags monster files that blow context windows. |
| **Dependency reproducibility** | Standard | Ecosystem-specific lockfiles present; automated update bot configs (`renovate`, `dependabot`). |
| **Standards enforcement tooling** | Standard | Linter/formatter configurations present; automated pre-commit or CI hooks enforcing style. |

All checks are **static, local, and zero-network** — no API keys required, deterministic, and safe for sensitive codebases.

---

## CI / CD Integration

`repograder` exits with **code 1** if the codebase scores at Level 1 (**Not agent-ready**), and **code 0** otherwise.

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
      - run: npx repograder --json > readiness.json
      - run: npx repograder
```

---

## Roadmap

- [ ] `--config` to tune file-size thresholds and ecosystem overrides per team
- [ ] GitHub Action bot to post scorecard diffs directly on pull requests
- [ ] `--history` flag to track readiness trends over time in a local scorecard
- [ ] Optional LLM deep pass for qualitative evaluations (e.g., API documentation clarity)

---

## License

[MIT](LICENSE)
