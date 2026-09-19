import type { BenchmarkResult } from './types';
import { c } from '../ui/colors';
import { renderBox } from '../ui/box';
import { renderProgressBar, renderGradePill } from '../ui/meter';

export function renderBenchmarkTerminal(result: BenchmarkResult): string {
  const m = result.metrics;
  const b = result.breakdown;
  const model = result.model;
  const lines: string[] = [];

  // Header Box
  const title = c.bold(c.cyan(' ⚡ REPOGRADER AI FRIENDLINESS BENCHMARK '));
  const subhead = `${c.dim('Workload:')} ${c.bold(
    'Cost & compute required to resolve 1,000 static issues',
  )}`;
  const modelInfo = `${c.dim('Target:')} ${c.bold(result.repoName)}   ${c.dim(
    'Model:',
  )} ${c.bold(model.name)} ($${model.inputPricePerM}/$${model.outputPricePerM} per M)   ${c.dim(
    'Mode:',
  )} ${c.green(result.mode)}`;

  const heroLines = [
    '',
    `  ${subhead}`,
    `  ${modelInfo}`,
    '',
    `  ${c.bold(c.white('AI FRIENDLINESS SCORE'))}   ${renderGradePill(
      m.grade,
    )}  ${renderProgressBar(m.friendlinessScore, 100, 18)}  ${c.bold(
      `${m.friendlinessScore}/100`,
    )}`,
    '',
    `  ${c.dim('┌───────────────────────┬───────────────────────┬───────────────────────┐')}`,
    `  ${c.dim('│')} ${c.bold('COST / 1k ISSUES')}     ${c.dim(
      '│',
    )} ${c.bold('TOKENS / 1k ISSUES')}   ${c.dim('│')} ${c.bold('TIME / 1k ISSUES')}     ${c.dim(
      '│',
    )}`,
    `  ${c.dim('│')} ${c
      .brightGreen(c.bold(`$${m.costPer1kUsd.toFixed(2)}`))
      .padEnd(21)} ${c.dim('│')} ${((m.tokensPer1k / 1_000_000).toFixed(2) + 'M tokens').padEnd(
      21,
    )} ${c.dim('│')} ${(m.timePer1kHours.toFixed(1) + ' hours').padEnd(21)} ${c.dim('│')}`,
    `  ${c.dim('├───────────────────────┼───────────────────────┼───────────────────────┤')}`,
    `  ${c.dim('│')} ${c.bold('COMPUTE TURNS')}      ${c.dim(
      '│',
    )} ${c.bold('FIRST-PASS ACCURACY')} ${c.dim('│')} ${c.bold('ACTIVE DEFECTS')}     ${c.dim(
      '│',
    )}`,
    `  ${c.dim('│')} ${(m.turnsPerIssue + ' turns / issue').padEnd(21)} ${c.dim(
      '│',
    )} ${(m.firstPassRate + '% 1st-turn pass').padEnd(21)} ${c.dim('│')} ${(
      result.activeIssuesFound + ' detected'
    ).padEnd(21)} ${c.dim('│')}`,
    `  ${c.dim('└───────────────────────┴───────────────────────┴───────────────────────┘')}`,
    '',
  ];

  lines.push('');
  lines.push(
    renderBox(heroLines, {
      title,
      borderColor:
        m.friendlinessScore >= 75 ? c.green : m.friendlinessScore >= 50 ? c.yellow : c.red,
      style: 'rounded',
    }),
  );
  lines.push('');

  // Cost Drivers & Bottleneck Attribution
  lines.push(`  ${c.bold(c.white('COST DRIVERS & BOTTLENECK ATTRIBUTION ($ / 1,000 ISSUES)'))}`);
  lines.push(
    `  ${c.dim('•')} ${c.bold('Base Context & Payload:')}    $${b.baseContextCostUsd.toFixed(
      2,
    )}  ${c.dim('(essential system rules & diagnostics)')}`,
  );
  if (b.fileBloatCostUsd > 0.05) {
    lines.push(
      `  ${c.dim('•')} ${c.yellow(c.bold('File Bloat Overhead:'))}        $${b.fileBloatCostUsd.toFixed(
        2,
      )}  ${c.dim('(monolithic files forced into context windows)')}`,
    );
  }
  if (b.explorationCostUsd > 0.05) {
    lines.push(
      `  ${c.dim('•')} ${c.yellow(c.bold('Exploration Tax:'))}            $${b.explorationCostUsd.toFixed(
        2,
      )}  ${c.dim('(turns spent searching without AGENTS.md specs)')}`,
    );
  }
  if (b.retryCostUsd > 0.05) {
    lines.push(
      `  ${c.dim('•')} ${c.yellow(c.bold('Verification & Retries:'))}     $${b.retryCostUsd.toFixed(
        2,
      )}  ${c.dim('(failed passes due to loose types or weak linters)')}`,
    );
  }
  lines.push('');

  // ROI Optimization Roadmap
  if (result.levers.length > 0) {
    lines.push(`  ${c.bold(c.white('ROI OPTIMIZATION ROADMAP (HOW TO LOWER THIS NUMBER)'))}`);
    for (const lever of result.levers) {
      const diffTag =
        lever.difficulty === 'easy'
          ? c.brightGreen('[Easy]')
          : lever.difficulty === 'medium'
            ? c.yellow('[Med]')
            : c.red('[Hard]');

      lines.push(
        `  ${diffTag} ${c.bold(lever.title)} ${c.brightGreen(
          `→ Save ~$${lever.projectedSavingsUsdPer1k.toFixed(2)} / 1k issues`,
        )}`,
      );
      lines.push(`         ${c.dim(lever.description)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderBenchmarkMarkdown(result: BenchmarkResult): string {
  const m = result.metrics;
  const b = result.breakdown;
  const model = result.model;

  const lines: string[] = [
    `# ⚡ AI Friendliness Benchmark: ${result.repoName}`,
    '',
    `**AI Friendliness Score:** **${m.friendlinessScore}/100** (Grade: **${m.grade}**) | Model: **${model.name}**`,
    '',
    `### 📊 1,000 Static Issues Benchmark Workload`,
    '',
    `| Metric | Value (Per 1,000 Issues) | Industry Standard Target |`,
    `| :--- | :--- | :--- |`,
    `| **Cost ($)** | **$${m.costPer1kUsd.toFixed(2)}** | < $15.00 |`,
    `| **Tokens Ingested & Generated** | **${(m.tokensPer1k / 1_000_000).toFixed(2)}M tokens** | < 3.5M |`,
    `| **Developer / CI Latency** | **${m.timePer1kHours.toFixed(1)} hours** | < 1.0 hour |`,
    `| **Compute / Turn Efficiency** | **${m.turnsPerIssue} turns / issue** | 1.1 turns / issue |`,
    `| **First-Pass Success Rate** | **${m.firstPassRate}%** | > 85% |`,
    '',
    `### 💸 Cost Driver Breakdown`,
    `- **Base Context Cost:** $${b.baseContextCostUsd.toFixed(2)}`,
    `- **File Bloat Tax:** $${b.fileBloatCostUsd.toFixed(2)}`,
    `- **Exploration Tax:** $${b.explorationCostUsd.toFixed(2)}`,
    `- **Retry & Verification Tax:** $${b.retryCostUsd.toFixed(2)}`,
    '',
  ];

  if (result.levers.length > 0) {
    lines.push(`### 🎯 ROI Optimization Roadmap`);
    lines.push('');
    for (const lever of result.levers) {
      lines.push(
        `- **${lever.title}** (\`${lever.difficulty}\`): Projected savings **~$${lever.projectedSavingsUsdPer1k.toFixed(
          2,
        )}** / 1k issues.`,
      );
      lines.push(`  *${lever.description}*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderBenchmarkJSON(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderBenchmarkCompact(result: BenchmarkResult): string {
  const m = result.metrics;
  return `${c.bold(result.repoName)}: AI Friendliness ${c.bold(
    `${m.friendlinessScore}/100`,
  )} (${m.grade}) | Cost/1k: ${c.brightGreen(`$${m.costPer1kUsd.toFixed(2)}`)} | Tokens/1k: ${(
    m.tokensPer1k / 1_000_000
  ).toFixed(1)}M | Time: ${m.timePer1kHours.toFixed(1)}h | Turns: ${m.turnsPerIssue}`;
}
