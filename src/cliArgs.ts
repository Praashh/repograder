import type { OutputFormat } from './config';
import { c } from './ui/colors';

export const SUBCOMMANDS = ['scan', 'init', 'fix', 'install-hook', 'diff', 'benchmark', 'help'];

export interface ParsedArgs {
  command: 'scan' | 'init' | 'fix' | 'install-hook' | 'diff' | 'benchmark' | 'help';
  target: string;
  diffTarget?: string;
  format?: OutputFormat;
  compact?: boolean;
  failUnder?: number;
  config?: string;
  dryRun?: boolean;
  slackWebhook?: string;
  discordWebhook?: string;
  notify?: boolean;
  force: boolean;
  help: boolean;
  model?: string;
  live?: boolean;
  sample?: number;
  save?: string;
  compare?: string;
  failOverCost?: number;
  watch?: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
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
    else if (sub === 'benchmark') args.command = 'benchmark';
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
    } else if (arg === '--html') {
      args.format = 'html';
    } else if (arg === '--watch' || arg === '-w') {
      args.watch = true;
    } else if (arg === '--compact') {
      args.compact = true;
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
        next === 'codeclimate' ||
        next === 'html'
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
        val === 'codeclimate' ||
        val === 'html'
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
    } else if (arg === '--live') {
      args.live = true;
    } else if (arg === '--simulate') {
      args.live = false;
    } else if (arg === '--model') {
      args.model = rest[++i];
    } else if (arg.startsWith('--model=')) {
      args.model = arg.split('=')[1];
    } else if (arg === '--sample') {
      const next = rest[++i];
      if (next && !isNaN(Number(next))) args.sample = Number(next);
    } else if (arg.startsWith('--sample=')) {
      const val = arg.split('=')[1];
      if (val && !isNaN(Number(val))) args.sample = Number(val);
    } else if (arg === '--save') {
      args.save = rest[++i];
    } else if (arg.startsWith('--save=')) {
      args.save = arg.split('=')[1];
    } else if (arg === '--compare') {
      args.compare = rest[++i];
    } else if (arg.startsWith('--compare=')) {
      args.compare = arg.split('=')[1];
    } else if (arg === '--fail-over-cost') {
      const next = rest[++i];
      if (next && !isNaN(Number(next))) args.failOverCost = Number(next);
    } else if (arg.startsWith('--fail-over-cost=')) {
      const val = arg.split('=')[1];
      if (val && !isNaN(Number(val))) args.failOverCost = Number(val);
    } else if (!arg.startsWith('-')) {
      if ((args.command === 'diff' || args.command === 'benchmark') && args.target !== '.') {
        args.diffTarget = arg;
      } else {
        args.target = arg;
      }
    }
  }

  return args;
}

export function printHelp(): void {
  const lines: string[] = [
    '',
    `  ${c.bold(c.cyan('repograder'))} ${c.dim('— Score codebase readiness for AI coding agents across 7 dimensions')}`,
    '',
    `  ${c.bold(c.white('USAGE'))}`,
    `    ${c.dim('$')} ${c.green('repograder')} ${c.dim('[path] [options]')}`,
    `    ${c.dim('$')} ${c.green('repograder')} ${c.cyan('<command>')} ${c.dim('[path] [options]')}`,
    '',
    `  ${c.bold(c.white('COMMANDS'))}`,
    `    ${c.cyan('scan')} ${c.dim('[path]')}              Run 7-dimension readiness scan on target directory (default)`,
    `    ${c.cyan('benchmark')} ${c.dim('[path]')}         Benchmark AI friendliness: time, tokens, compute, and $ / 1k issues`,
    `    ${c.cyan('fix')} ${c.dim('[path]')}               Auto-remediate missing stubs, .env.example, and .gitignore`,
    `    ${c.cyan('init')} ${c.dim('[path]')}              Scaffold tailored AGENTS.md context documentation`,
    `    ${c.cyan('install-hook')} ${c.dim('[path]')}      Install git pre-commit quality gate for agent readiness`,
    `    ${c.cyan('diff')} ${c.dim('<base> <head>')}       Compare two JSON reports to detect regressions`,
    '',
    `  ${c.bold(c.white('BENCHMARK OPTIONS'))}`,
    `    ${c.yellow('--model <name>')}          Model pricing preset (sonnet, flash, gpt4o, haiku, deepseek, local)`,
    `    ${c.yellow('--live')}                  Run empirical live agent benchmark using active API keys`,
    `    ${c.yellow('--simulate')}              Run instantaneous analytical physics simulation (default)`,
    `    ${c.yellow('--sample <n>')}            Number of defect probes to sample in live mode (default: 3)`,
    `    ${c.yellow('--compare <base.json>')}   Compare against prior benchmark snapshot to track ROI progress`,
    `    ${c.yellow('--save <path>')}           Save benchmark result to JSON file for CI tracking`,
    `    ${c.yellow('--fail-over-cost <$')}     CI gate: fail if cost per 1k issues exceeds budget threshold`,
    '',
    `  ${c.bold(c.white('OUTPUT FORMATS'))}`,
    `    ${c.yellow('--format text')}           Rich terminal UI with hero scorecard & roadmap (default)`,
    `    ${c.yellow('--format html')}           Self-contained interactive visual HTML dashboard & ROI simulator`,
    `    ${c.yellow('--html')}                  Shorthand for --format html`,
    `    ${c.yellow('--compact')}               Condensed single-line summary with dimension status`,
    `    ${c.yellow('--json')}                  Structured JSON for automation pipelines`,
    `    ${c.yellow('--markdown, --md')}        GitHub Flavored Markdown (ideal for PR comments & CI summaries)`,
    `    ${c.yellow('--badge')}                 Shields.io endpoint schema`,
    `    ${c.yellow('--sarif')}                 SARIF log for GitHub Code Scanning integration`,
    `    ${c.yellow('--codeclimate')}           GitLab / Code Climate issues report`,
    '',
    `  ${c.bold(c.white('OPTIONS & CI GATES'))}`,
    `    ${c.yellow('--watch, -w')}             Watch directory and re-score live on file changes`,
    `    ${c.yellow('--fail-under <1-5>')}      Exit with code 1 if ceiling score is below threshold`,
    `    ${c.yellow('--dry-run')}               Preview remediation actions without modifying files (fix)`,
    `    ${c.yellow('--config <path>')}         Custom configuration path (default: repograder.config.json)`,
    `    ${c.yellow('--force, -f')}             Overwrite existing AGENTS.md when running init`,
    `    ${c.yellow('--slack-webhook <u>')}     Send report notification to Slack incoming webhook`,
    `    ${c.yellow('--discord-webhook <u>')}   Send report notification to Discord incoming webhook`,
    `    ${c.yellow('--notify')}                Dispatch notifications to configured webhooks`,
    `    ${c.yellow('-h, --help')}              Show this help message`,
    '',
    `  ${c.bold(c.white('EXAMPLES'))}`,
    `    ${c.dim('$')} ${c.green('repograder')}                                 ${c.dim('# Scan current directory')}`,
    `    ${c.dim('$')} ${c.green('repograder benchmark')}                       ${c.dim('# Benchmark AI friendliness ($/1k issues)')}`,
    `    ${c.dim('$')} ${c.green('repograder benchmark --model flash')}         ${c.dim('# Benchmark on Gemini 2.0 Flash pricing')}`,
    `    ${c.dim('$')} ${c.green('repograder benchmark --compare base.json')}   ${c.dim('# Compare progress against previous run')}`,
    `    ${c.dim('$')} ${c.green('repograder --compact')}                       ${c.dim('# Condensed 1-line check')}`,
    `    ${c.dim('$')} ${c.green('repograder fix')}                             ${c.dim('# Apply remediation stubs')}`,
    `    ${c.dim('$')} ${c.green('repograder diff base.json head.json')}        ${c.dim('# Compare reports in terminal')}`,
    `    ${c.dim('$')} ${c.green('repograder --fail-under 4')}                  ${c.dim('# CI gate: fail if readiness < 4')}`,
    '',
  ];

  console.log(lines.join('\n'));
}
