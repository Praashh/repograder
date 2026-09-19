#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { runAll } from '../src/score';
import {
  renderJSON,
  renderText,
  renderCompactText,
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
import { c } from '../src/ui/colors';
import { renderBox } from '../src/ui/box';
import { createSpinner } from '../src/ui/spinner';
import {
  runBenchmark,
  renderBenchmarkTerminal,
  renderBenchmarkMarkdown,
  renderBenchmarkJSON,
  renderBenchmarkCompact,
  compareBenchmarks,
} from '../src/benchmark';

const SUBCOMMANDS = ['scan', 'init', 'fix', 'install-hook', 'diff', 'benchmark', 'help'];

interface ParsedArgs {
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

function printHelp(): void {
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
    `    ${c.yellow('--compact')}               Condensed single-line summary with dimension status`,
    `    ${c.yellow('--json')}                  Structured JSON for automation pipelines`,
    `    ${c.yellow('--markdown, --md')}        GitHub Flavored Markdown (ideal for PR comments & CI summaries)`,
    `    ${c.yellow('--badge')}                 Shields.io endpoint schema`,
    `    ${c.yellow('--sarif')}                 SARIF log for GitHub Code Scanning integration`,
    `    ${c.yellow('--codeclimate')}           GitLab / Code Climate issues report`,
    '',
    `  ${c.bold(c.white('OPTIONS & CI GATES'))}`,
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
      const diff = compareResults(baseResult, headResult, path.basename(headPath));
      if (args.format === 'markdown') {
        console.log(diff.markdown);
      } else if (args.format === 'json') {
        console.log(JSON.stringify(diff, null, 2));
      } else {
        console.log(diff.terminal);
      }
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
      console.log(`\n${c.brightGreen('✔')} ${c.bold('Git hook installed successfully')}`);
      console.log(`  ${c.dim(res.message)}\n`);
      process.exit(0);
    } else {
      console.error(`\n${c.red('✖')} ${c.bold('Failed to install Git hook')}`);
      console.error(`  ${c.dim(res.message)}\n`);
      process.exit(1);
    }
  }

  // 3. fix subcommand
  if (args.command === 'fix') {
    const res = runFix(target, { dryRun: args.dryRun });
    const title = args.dryRun
      ? c.yellow(c.bold(' 🔍 REPOGRADER FIX (DRY-RUN) '))
      : c.brightGreen(c.bold(' 🛠️  REPOGRADER FIX '));
    const fixLines: string[] = [''];
    if (res.actions.length === 0) {
      fixLines.push(`  ${c.brightGreen('✔')} No automatic remediations needed. Codebase is clean!`);
    } else {
      for (const act of res.actions) {
        const statusTag = act.applied ? c.brightGreen('✔ applied') : c.yellow('🔍 preview');
        fixLines.push(`  ${statusTag}  ${c.bold(act.file)}`);
        fixLines.push(`             ${c.dim(act.description)}`);
      }
    }
    fixLines.push('');
    fixLines.push(`  ${c.dim('Summary:')} ${c.bold(res.summary)}`);
    fixLines.push('');
    console.log('');
    console.log(
      renderBox(fixLines, {
        title,
        borderColor: args.dryRun ? c.yellow : c.green,
        style: 'rounded',
      }),
    );
    console.log('');
    process.exit(0);
  }

  // 4. init subcommand
  if (args.command === 'init') {
    const res = initAgentsMd(target, { force: args.force });
    if (res.success) {
      console.log('');
      console.log(
        renderBox(
          [
            '',
            `  ${c.brightGreen('✔')} ${c.bold('Successfully initialized AGENTS.md')}`,
            '',
            `  ${c.dim('Location:')}   ${path.join(target, 'AGENTS.md')}`,
            `  ${c.dim('Next steps:')} Run ${c.cyan('repograder')} to scan and verify agent readiness.`,
            '',
          ],
          { title: c.bold(c.cyan(' 🤖 REPOGRADER INIT ')), borderColor: c.green, style: 'rounded' },
        ),
      );
      console.log('');
      process.exit(0);
    } else {
      console.error('');
      console.error(
        renderBox(
          ['', `  ${c.red('✖')} ${c.bold('Initialization failed')}`, `  ${c.dim(res.message)}`, ''],
          { title: c.bold(c.red(' ❌ ERROR ')), borderColor: c.red, style: 'rounded' },
        ),
      );
      console.error('');
      process.exit(1);
    }
  }

  // 5. benchmark subcommand
  if (args.command === 'benchmark') {
    // Check if comparing two JSON files directly: repograder benchmark diff base.json head.json
    if (args.diffTarget && fs.existsSync(args.target) && fs.existsSync(args.diffTarget)) {
      try {
        const baseJson = JSON.parse(fs.readFileSync(args.target, 'utf8'));
        const headJson = JSON.parse(fs.readFileSync(args.diffTarget, 'utf8'));
        const diff = compareBenchmarks(baseJson, headJson, path.basename(args.diffTarget));
        if (args.format === 'markdown') {
          console.log(diff.markdown);
        } else if (args.format === 'json') {
          console.log(JSON.stringify(diff, null, 2));
        } else {
          console.log(diff.terminal);
        }
        process.exit(diff.costDeltaUsd > 0 ? 1 : 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error comparing benchmark JSON files: ${msg}`);
        process.exit(1);
      }
    }

    const resolvedFormat: OutputFormat = args.format || config.format || 'text';
    const isInteractiveTTY =
      Boolean(process.stdout && process.stdout.isTTY) && resolvedFormat === 'text';

    let benchSpinner;
    if (isInteractiveTTY && !args.compact) {
      benchSpinner = createSpinner(
        'Benchmarking codebase AI friendliness for coding agents...',
      ).start();
    }

    const benchResult = await runBenchmark(target, {
      model: args.model || config.benchmark?.defaultModel,
      mode: args.live ? 'live' : 'analytical',
      sample: args.sample || config.benchmark?.sampleSize,
    });

    if (benchSpinner) {
      benchSpinner.stop();
    }

    // Compare against prior benchmark if requested
    if (args.compare) {
      const comparePath = path.resolve(process.cwd(), args.compare);
      if (!fs.existsSync(comparePath)) {
        console.error(`Error: Compare file not found at "${comparePath}"`);
        process.exit(1);
      }
      try {
        const baseJson = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
        const diff = compareBenchmarks(baseJson, benchResult, path.basename(target));
        if (args.format === 'markdown') {
          console.log(diff.markdown);
        } else if (args.format === 'json') {
          console.log(JSON.stringify(diff, null, 2));
        } else {
          console.log(diff.terminal);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error reading comparison benchmark: ${msg}`);
        process.exit(1);
      }
    } else {
      let output: string;
      if (args.compact) {
        output = renderBenchmarkCompact(benchResult);
      } else {
        switch (resolvedFormat) {
          case 'json':
            output = renderBenchmarkJSON(benchResult);
            break;
          case 'markdown':
            output = renderBenchmarkMarkdown(benchResult);
            break;
          case 'text':
          default:
            output = renderBenchmarkTerminal(benchResult);
            break;
        }
      }
      console.log(output);
    }

    // Save snapshot if requested
    if (args.save) {
      const savePath = path.resolve(process.cwd(), args.save);
      fs.writeFileSync(savePath, JSON.stringify(benchResult, null, 2), 'utf8');
      console.log(
        `\n${c.brightGreen('✔')} ${c.dim('Benchmark snapshot saved to:')} ${c.bold(savePath)}\n`,
      );
    }

    // CI Cost gate check
    const maxCost = args.failOverCost ?? config.benchmark?.failOverCost;
    if (maxCost !== undefined && benchResult.metrics.costPer1kUsd > maxCost) {
      console.error(
        `\n${c.red('✖')} CI Gate: Benchmark cost ($${benchResult.metrics.costPer1kUsd.toFixed(
          2,
        )}) exceeded fail-over threshold ($${maxCost.toFixed(2)})\n`,
      );
      process.exit(1);
    }

    process.exit(0);
  }

  // 6. scan subcommand
  const resolvedFormat: OutputFormat = args.format || config.format || 'text';
  const isInteractiveTTY =
    Boolean(process.stdout && process.stdout.isTTY) && resolvedFormat === 'text';

  let spinner;
  if (isInteractiveTTY && !args.compact) {
    spinner = createSpinner('Analyzing codebase readiness for AI coding agents...').start();
  }

  const result = runAll(target);

  if (spinner) {
    spinner.stop();
  }

  let output: string;
  if (args.compact) {
    output = renderCompactText(result, target);
  } else {
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
