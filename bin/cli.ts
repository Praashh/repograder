#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { runAll } from '../src/score';
import { renderJSON, renderText } from '../src/report';

const SUBCOMMANDS = ['scan', 'help'];

interface ParsedArgs {
  target: string;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { target: '.', json: false, help: false };

  // strip node + script
  let rest = argv.slice(2);

  // consume known subcommand if present (e.g. "scan")
  if (rest.length > 0 && rest[0] !== undefined && SUBCOMMANDS.includes(rest[0])) {
    rest = rest.slice(1);
  }

  for (const arg of rest) {
    if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else args.target = arg;
  }
  return args;
}

function printHelp(): void {
  console.log(`
repograder — score a codebase's readiness for AI coding agents

Usage:
  repograder [path] [options]         # scan current directory or path
  repograder scan [path] [options]    # explicit scan subcommand
  npx repograder [path] [options]     # run without installing

  (alias: agent-ready)

  If [path] is omitted, the current working directory is scanned.

Options:
  --json      Output machine-readable JSON instead of the console report
  -h, --help  Show this help message

Examples:
  cd my-project && repograder
  repograder scan
  repograder ../my-service
  repograder . --json > report.json
  npx repograder scan
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

  const result = runAll(target);
  const output = args.json ? renderJSON(result, target) : renderText(result, target);
  console.log(output);

  // Non-zero exit when the codebase isn't agent-ready — useful for CI gating later.
  process.exit(result.ceiling <= 1 ? 1 : 0);
}

main();
