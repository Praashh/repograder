#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { runAll } from '../src/score';
import {
  renderJSON,
  renderText,
  renderMarkdown,
  renderBadge,
  renderSARIF,
  renderCodeClimate,
} from '../src/report';
import { initAgentsMd } from '../src/init';
import { runFix } from '../src/fix';
import { installGitHook } from '../src/hook';
import { compareResults } from '../src/diff';
import { loadConfig, type OutputFormat } from '../src/config';
import { sendSlackNotification, sendDiscordNotification } from '../src/notify';

const SUBCOMMANDS = ['scan', 'init', 'fix', 'install-hook', 'diff', 'help'];

interface ParsedArgs {
  command: 'scan' | 'init' | 'fix' | 'install-hook' | 'diff' | 'help';
  target: string;
  diffTarget?: string;
  format?: OutputFormat;
  failUnder?: number;
  config?: string;
  dryRun?: boolean;
  slackWebhook?: string;
  discordWebhook?: string;
  notify?: boolean;
  force: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: 'scan',
    target: '.',
    force: false,
    help: false,
  };

  let rest = argv.slice(2);

  if (rest.length > 0 && rest[0] !== undefined && SUBCOMMANDS.includes(rest[0])) {
    const sub = rest[0];
    if (sub === 'init') args.command = 'init';
    else if (sub === 'fix') args.command = 'fix';
    else if (sub === 'install-hook') args.command = 'install-hook';
    else if (sub === 'diff') args.command = 'diff';
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
    } else if (arg === '--sarif') {
      args.format = 'sarif';
    } else if (arg === '--codeclimate') {
      args.format = 'codeclimate';
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--notify') {
      args.notify = true;
    } else if (arg === '--format') {
      const next = rest[++i];
      if (
        next === 'json' ||
        next === 'markdown' ||
        next === 'badge' ||
        next === 'text' ||
        next === 'sarif' ||
        next === 'codeclimate'
      ) {
        args.format = next;
      }
    } else if (arg.startsWith('--format=')) {
      const val = arg.split('=')[1] as OutputFormat;
      if (
        val === 'json' ||
        val === 'markdown' ||
        val === 'badge' ||
        val === 'text' ||
        val === 'sarif' ||
        val === 'codeclimate'
      ) {
        args.format = val;
      }
    } else if (arg === '--config') {
      args.config = rest[++i];
    } else if (arg.startsWith('--config=')) {
      args.config = arg.split('=')[1];
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
    } else if (arg === '--slack-webhook') {
      args.slackWebhook = rest[++i];
    } else if (arg === '--discord-webhook') {
      args.discordWebhook = rest[++i];
    } else if (arg === '--force' || arg === '-f') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (!arg.startsWith('-')) {
      if (args.command === 'diff' && args.target !== '.') {
        args.diffTarget = arg;
      } else {
        args.target = arg;
      }
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
repograder — score a codebase's readiness for AI coding agents

Usage:
  repograder [path] [options]               # scan current directory or path
  repograder scan [path] [options]          # explicit scan subcommand
  repograder init [path] [options]          # scaffold tailored AGENTS.md
  repograder fix [path] [options]           # auto-remediate missing stubs & .gitignore
  repograder install-hook [path]            # install git pre-commit readiness gate
  repograder diff <base.json> <head.json>   # compare readiness reports
  npx repograder [path] [options]           # run without installing

Options:
  --format <type>     Output format: text (default), json, markdown, badge, sarif, codeclimate
  --sarif             Shorthand for --format sarif (GitHub Code Scanning)
  --codeclimate       Shorthand for --format codeclimate (GitLab / Code Climate)
  --json              Shorthand for --format json
  --markdown, --md    Shorthand for --format markdown (ideal for CI step summaries)
  --badge             Shorthand for --format badge (Shields.io schema)
  --config <path>     Custom path to configuration file (repograder.config.json)
  --fail-under <1-5>  Fail CI with exit code 1 if ceiling score is below threshold
  --dry-run           Preview remediation actions without modifying files (repograder fix)
  --slack-webhook <u> Send report notification to Slack webhook URL
  --discord-webhook <u> Send report notification to Discord webhook URL
  --notify            Dispatch alerts to configured webhooks
  --force, -f         Overwrite existing AGENTS.md when running init
  -h, --help          Show this help message

Examples:
  repograder                                # quick scan of current directory
  repograder scan ../my-service             # scan another directory
  repograder fix --dry-run                  # preview automated remediations
  repograder fix                            # apply remediation stubs
  repograder install-hook                   # install pre-commit hook
  repograder --format sarif > results.sarif # export for GitHub Code Scanning
  repograder --fail-under 4                 # CI gate: fail if readiness < 4
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // 1. diff subcommand
  if (args.command === 'diff') {
    if (!args.target || !args.diffTarget) {
      console.error(
        'Error: "diff" requires two JSON report files: repograder diff <base.json> <head.json>',
      );
      process.exit(1);
    }
    const basePath = path.resolve(process.cwd(), args.target);
    const headPath = path.resolve(process.cwd(), args.diffTarget);
    if (!fs.existsSync(basePath) || !fs.existsSync(headPath)) {
      console.error('Error: One or both report files could not be found.');
      process.exit(1);
    }
    try {
      const baseJson = JSON.parse(fs.readFileSync(basePath, 'utf8'));
      const headJson = JSON.parse(fs.readFileSync(headPath, 'utf8'));
      // Construct RunAllResult shapes
      const baseResult = {
        results: baseJson.dimensions || [],
        ceiling: baseJson.ceilingScore ?? 1,
        level: { min: 1, max: 1, name: baseJson.readinessLevel || 'Unknown' },
        indexScore: baseJson.indexScore ?? 0,
        grade: baseJson.grade || '',
        remediation: [],
      };
      const headResult = {
        results: headJson.dimensions || [],
        ceiling: headJson.ceilingScore ?? 1,
        level: { min: 1, max: 1, name: headJson.readinessLevel || 'Unknown' },
        indexScore: headJson.indexScore ?? 0,
        grade: headJson.grade || '',
        remediation: [],
      };
      const diff = compareResults(baseResult, headResult);
      console.log(diff.markdown);
      process.exit(diff.isRegression ? 1 : 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error parsing report JSON files: ${msg}`);
      process.exit(1);
    }
  }

  const target = path.resolve(process.cwd(), args.target);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    console.error(`Error: "${args.target}" is not a directory.`);
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(target, args.config);

  // 2. install-hook subcommand
  if (args.command === 'install-hook') {
    const res = installGitHook(target);
    if (res.success) {
      console.log(`✅ ${res.message}`);
      process.exit(0);
    } else {
      console.error(`❌ ${res.message}`);
      process.exit(1);
    }
  }

  // 3. fix subcommand
  if (args.command === 'fix') {
    const res = runFix(target, { dryRun: args.dryRun });
    console.log(`\n🛠️  repograder fix: ${res.summary}\n`);
    for (const act of res.actions) {
      const statusIcon = act.applied ? '✅' : '🔍 (dry-run)';
      console.log(`  ${statusIcon} ${act.file}: ${act.description}`);
    }
    console.log('');
    process.exit(0);
  }

  // 4. init subcommand
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

  // 5. scan subcommand
  const result = runAll(target);

  const resolvedFormat: OutputFormat = args.format || config.format || 'text';
  let output: string;
  switch (resolvedFormat) {
    case 'json':
      output = renderJSON(result, target);
      break;
    case 'markdown':
      output = renderMarkdown(result, target);
      break;
    case 'badge':
      output = renderBadge(result);
      break;
    case 'sarif':
      output = renderSARIF(result, target);
      break;
    case 'codeclimate':
      output = renderCodeClimate(result, target);
      break;
    case 'text':
    default:
      output = renderText(result, target);
      break;
  }

  console.log(output);

  // Webhook notifications
  const slackUrl = args.slackWebhook || (args.notify ? config.webhooks?.slack : undefined);
  if (slackUrl) {
    await sendSlackNotification(slackUrl, result, path.basename(target));
  }

  const discordUrl = args.discordWebhook || (args.notify ? config.webhooks?.discord : undefined);
  if (discordUrl) {
    await sendDiscordNotification(discordUrl, result, path.basename(target));
  }

  // CI exit code evaluation
  const failUnder = args.failUnder !== undefined ? args.failUnder : config.failUnder;
  if (failUnder !== undefined) {
    process.exit(result.ceiling < failUnder ? 1 : 0);
  } else {
    process.exit(result.ceiling <= 1 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
