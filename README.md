# repograder

> Score how ready a codebase is for AI coding agents to work in — language-agnostic, zero-config, fast, and deterministic.

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](https://github.com/Praashh/repograder/actions)
[![Agent Readiness](<https://img.shields.io/badge/agent%20readiness-Autonomous--ready%20(5%2F5)-brightgreen>)](https://github.com/Praashh/repograder)

AI coding agents (like Claude Code, Cursor, Copilot Workspace, Codex, Devin) struggle or fail silently when a codebase lacks test harnesses, stale documentation, monster files, or missing linters.

**`repograder`** evaluates your repository across 7 fundamental dimensions, detects potential failure modes, outputs a readiness scorecard with a granular **Readiness Index (0–100)**, and generates actionable, copy-pasteable remediation commands.

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

# Automatically remediate missing .gitignore entries, .env.example, and test stubs
repograder fix

# Preview fixes without writing changes
repograder fix --dry-run

# Install git pre-commit hook gate
repograder install-hook

# Benchmark AI Friendliness ($ / 1,000 static issues, tokens, and compute)
repograder benchmark

# Benchmark using Gemini 2.0 Flash pricing tier
repograder benchmark --model flash

# Compare against prior benchmark snapshot
repograder benchmark --compare base.json

# Gate CI if cost exceeds budget threshold
repograder benchmark --fail-over-cost 15.00

# Compare base and head reports for regressions in CI
repograder diff base.json head.json

# Scan another directory or project
repograder scan ../my-service

# Output GitHub Code Scanning SARIF format
repograder --format sarif > results.sarif

# Output GitLab Code Climate JSON
repograder --format codeclimate > gl-code-quality-report.json

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

| Command / Flag            | Description                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `[path]`                  | Path to repository to scan (defaults to current directory `.`)                               |
| `benchmark [path]`        | Quantify AI friendliness: time, tokens, compute, and $ cost to fix 1,000 static issues       |
| `init [path]`             | Scaffold a tailored `AGENTS.md` context file based on detected tools and package manifests   |
| `fix [path]`              | Automatically scaffold missing `.gitignore` rules, `.env.example`, and test stubs            |
| `install-hook [path]`     | Install native Git pre-commit hook to guard readiness on commit                              |
| `diff <base> <head>`      | Compare two JSON reports and generate markdown scorecard regression diff                     |
| `--model <name>`          | Benchmark pricing preset: `sonnet` (default), `flash`, `gpt4o`, `haiku`, `deepseek`, `local` |
| `--compare <file>`        | Compare current benchmark against a prior JSON snapshot to track cost reductions             |
| `--save <file>`           | Save benchmark results to JSON file for CI tracking and PR summaries                         |
| `--fail-over-cost <$>`    | CI cost gate: exit 1 if benchmark cost per 1k issues exceeds budget threshold                |
| `--live`                  | Run empirical live agent benchmark using active environment API keys                         |
| `--format <type>`         | Output format: `text` (default), `json`, `markdown`, `badge`, `sarif`, `codeclimate`         |
| `--sarif`                 | Shorthand for `--format sarif` (GitHub Code Scanning)                                        |
| `--codeclimate`           | Shorthand for `--format codeclimate` (GitLab / Code Climate)                                 |
| `--markdown`, `--md`      | Shorthand for `--format markdown`                                                            |
| `--json`                  | Shorthand for `--format json`                                                                |
| `--badge`                 | Output Shields.io badge endpoint JSON schema                                                 |
| `--config <path>`         | Path to custom configuration file (`repograder.config.json`)                                 |
| `--fail-under <1-5>`      | Exit with code 1 if ceiling readiness score is below this threshold                          |
| `--dry-run`               | Preview remediation actions without writing files                                            |
| `--slack-webhook <url>`   | Dispatch report to Slack webhook channel                                                     |
| `--discord-webhook <url>` | Dispatch report to Discord webhook channel                                                   |
| `--notify`                | Send alerts to configured webhooks                                                           |
| `--force`, `-f`           | Overwrite existing `AGENTS.md` when running `init`                                           |
| `-h, --help`              | Show usage help and options                                                                  |

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

## ⚡ AI Friendliness Benchmark (Version 1)

`repograder benchmark` quantifies the bottom-line engineering cost of interacting with AI coding agents:

> **"How much time, tokens, compute, and $ does fixing 1,000 static issues take on this codebase?"**

Messy codebases with monster files, missing specs, and loose types cause agent token consumption and retry loops to explode. Repograder breaks down these costs and provides a concrete roadmap to reduce them.

### What It Measures:

- **$ Cost / 1,000 Issues:** Projected or empirical dollar spend across frontier model tiers.
- **Tokens / 1,000 Issues:** Total prompt context ingested and completion tokens generated.
- **Time / 1,000 Issues:** Developer waiting time and CI test feedback loops.
- **Compute Efficiency:** Average agent turns and tool calls required per issue resolution.
- **First-Pass Accuracy:** Rate at which agents resolve static defects on Turn 1 without retries.

### Supported Model Presets

- `--model sonnet`: Claude 3.5 Sonnet ($3.00 / $15.00 per M tokens) — _Default_
- `--model flash`: Gemini 2.0 Flash ($0.10 / $0.40 per M tokens)
- `--model gpt4o`: GPT-4o ($2.50 / $10.00 per M tokens)
- `--model haiku`: Claude 3.5 Haiku ($0.80 / $4.00 per M tokens)
- `--model deepseek`: DeepSeek V3 ($0.14 / $0.28 per M tokens)
- `--model local`: Local / Ollama ($0.00 API cost)

### CI Cost Budget Gating & Progress Tracking

```bash
# Save baseline snapshot
repograder benchmark --save baseline.json

# Track cost reductions over time
repograder benchmark --compare baseline.json

# Fail CI if cost exceeds budget threshold
repograder benchmark --fail-over-cost 15.00
```

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


## License

[MIT](LICENSE)
