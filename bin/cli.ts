#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { runAll } from '../src/score';
import { renderJSON, renderText, renderMarkdown, renderBadge } from '../src/report';
import { initAgentsMd } from '../src/init';

const SUBCOMMANDS = ['scan', 'init', 'help'];

type OutputFormat = 'text' | 'json' | 'markdown' | 'badge';

interface ParsedArgs {
  command: 'scan' | 'init' | 'help';
  target: string;
  format: OutputFormat;
  failUnder?: number;
  force: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: 'scan',
    target: '.',
    format: 'text',
    force: false,
    help: false,
  };

  let rest = argv.slice(2);

  if (rest.length > 0 && rest[0] !== undefined && SUBCOMMANDS.includes(rest[0])) {
    const sub = rest[0];
    if (sub === 'init') args.command = 'init';
    else if (sub === 'help') args.help = true;
    else if (sub === 'scan') args.command = 'scan';
    rest = rest.slice(1);
  }

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') {
      args.format = 'json';
    } else if (arg === '--markdown' || arg === '--md') {
      args.format = 'markdown';
    } else if (arg === '--badge') {
      args.format = 'badge';
    } else if (arg === '--format') {
      const next = rest[++i];
      if (next === 'json' || next === 'markdown' || next === 'badge' || next === 'text') {
        args.format = next;
      }
    } else if (arg.startsWith('--format=')) {
      const val = arg.split('=')[1];
      if (val === 'json' || val === 'markdown' || val === 'badge' || val === 'text') {
        args.format = val;
      }
    } else if (arg === '--fail-under') {
      const next = rest[++i];
      if (next && !isNaN(Number(next))) {
        args.failUnder = Number(next);
      }
    } else if (arg.startsWith('--fail-under=')) {
      const val = arg.split('=')[1];
      if (val && !isNaN(Number(val))) {
        args.failUnder = Number(val);
      }
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!arg.startsWith('-')) {
      args.target = arg;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
repograder — score a codebase's readiness for AI coding agents

Usage:
  repograder [path] [options]         # scan current directory or path
  repograder scan [path] [options]    # explicit scan subcommand
  repograder init [path] [options]    # scaffold tailored AGENTS.md
  npx repograder [path] [options]     # run without installing

Options:
  --format <format>   Output format: text (default), json, markdown, badge
  --json              Shorthand for --format json
  --markdown, --md    Shorthand for --format markdown (ideal for CI step summaries)
  --badge             Shorthand for --format badge (Shields.io schema)
  --fail-under <1-5>  Fail CI with exit code 1 if ceiling score is below threshold
  --force, -f         Overwrite existing AGENTS.md when running init
  -h, --help          Show this help message

Examples:
  repograder                          # quick scan of current directory
  repograder scan ../my-service       # scan another directory
  repograder --markdown >> $GITHUB_STEP_SUMMARY # GitHub Actions summary
  repograder --fail-under 3           # CI gate: fail if readiness < 3
  repograder init                     # auto-generate starter AGENTS.md
`);
}

function main(): void {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const target = path.resolve(process.cwd(), args.target);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`Error: "${args.target}" is not a directory.`);
    process.exit(1);
  }

  if (args.command === 'init') {
    const res = initAgentsMd(target, { force: args.force });
    if (res.success) {
      console.log(`✅ ${res.message}`);
      process.exit(0);
    } else {
      console.error(`❌ ${res.message}`);
      process.exit(1);
    }
  }

  const result = runAll(target);

  let output: string;
  switch (args.format) {
    case 'json':
      output = renderJSON(result, target);
      break;
    case 'markdown':
      output = renderMarkdown(result, target);
      break;
    case 'badge':
      output = renderBadge(result);
      break;
    case 'text':
    default:
      output = renderText(result, target);
      break;
  }

  console.log(output);

  // CI exit code evaluation
  if (args.failUnder !== undefined) {
    process.exit(result.ceiling < args.failUnder ? 1 : 0);
  } else {
    // Default: fail only if not agent-ready (ceiling <= 1)
    process.exit(result.ceiling <= 1 ? 1 : 0);
  }
}

main();
