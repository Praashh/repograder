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
  renderHTML,
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

import { parseArgs, printHelp } from '../src/cliArgs';

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
  if (args.watch) {
    const doScan = () => {
      console.clear();
      const res = runAll(target);
      console.log(renderText(res, target));
      console.log(
        `\n  ${c.dim('⚡ Watching for file changes in')} ${c.cyan(target)} ${c.dim(
          `[last scan: ${new Date().toLocaleTimeString()}] (Ctrl+C to exit)`,
        )}\n`,
      );
    };

    doScan();

    let debounceTimer: NodeJS.Timeout | null = null;
    try {
      fs.watch(target, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (
          filename.includes('.git') ||
          filename.includes('node_modules') ||
          filename.includes('dist') ||
          filename.includes('.repograder')
        ) {
          return;
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doScan, 300);
      });
      await new Promise(() => {});
    } catch (err: unknown) {
      console.error('Watch error:', err);
    }
    return;
  }

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
      case 'html':
        output = renderHTML(result, target);
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
