import type { RunAllResult } from './types';
import { c } from './ui/colors';
import { renderBox } from './ui/box';

export interface DimensionDiff {
  id: string;
  label: string;
  baseScore: number;
  headScore: number;
  delta: number;
}

export interface ScoreDiff {
  ceilingDelta: number;
  indexDelta: number;
  isRegression: boolean;
  dimensionDiffs: DimensionDiff[];
  markdown: string;
  terminal: string;
}

export function renderTerminalDiff(
  diff: Omit<ScoreDiff, 'terminal'>,
  base: RunAllResult,
  head: RunAllResult,
  repoName = 'Repository',
): string {
  const lines: string[] = [];
  const statusColor = diff.isRegression
    ? c.red
    : diff.ceilingDelta > 0 || diff.indexDelta > 0
      ? c.brightGreen
      : c.cyan;
  const statusText = diff.isRegression
    ? '⚠️  Regression Detected'
    : diff.ceilingDelta > 0 || diff.indexDelta > 0
      ? '🎉  Readiness Improved!'
      : '✅  No Change';

  lines.push('');
  lines.push(
    renderBox(
      [
        `${c.bold('Scorecard Diff')}  ${c.dim('for')} ${c.bold(repoName)}`,
        `${statusColor(statusText)}  ${c.dim(
          `(Ceiling: ${diff.ceilingDelta >= 0 ? '+' : ''}${diff.ceilingDelta}, Index: ${
            diff.indexDelta >= 0 ? '+' : ''
          }${diff.indexDelta})`,
        )}`,
      ],
      { style: 'rounded', borderColor: diff.isRegression ? c.red : c.green },
    ),
  );
  lines.push('');

  lines.push(`  ${c.bold('OVERALL METRICS')}`);
  const cSign =
    diff.ceilingDelta > 0
      ? c.brightGreen(`+${diff.ceilingDelta}`)
      : diff.ceilingDelta < 0
        ? c.red(`${diff.ceilingDelta}`)
        : c.dim('0');
  const iSign =
    diff.indexDelta > 0
      ? c.brightGreen(`+${diff.indexDelta}`)
      : diff.indexDelta < 0
        ? c.red(`${diff.indexDelta}`)
        : c.dim('0');
  lines.push(
    `  Readiness Level: ${c.dim(`${base.level.name} (${base.ceiling}/5)`)} ──▶ ${c.bold(
      `${head.level.name} (${head.ceiling}/5)`,
    )}  [${cSign}]`,
  );
  lines.push(
    `  Readiness Index: ${c.dim(`${base.indexScore}/100 (${base.grade})`)} ──▶ ${c.bold(
      `${head.indexScore}/100 (${head.grade})`,
    )}  [${iSign}]`,
  );
  lines.push('');

  lines.push(`  ${c.bold('DIMENSION BREAKDOWN')}`);
  for (const d of diff.dimensionDiffs) {
    const deltaColor = d.delta > 0 ? c.brightGreen : d.delta < 0 ? c.red : c.gray;
    const deltaIcon = d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '●';
    const deltaStr = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
    lines.push(
      `  ${deltaColor(deltaIcon)} ${deltaColor(deltaStr.padStart(2))}  ${c.bold(
        d.label.padEnd(35),
      )} ${c.dim(`${d.baseScore}/5`)} ──▶ ${c.bold(`${d.headScore}/5`)}`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

export function compareResults(
  base: RunAllResult,
  head: RunAllResult,
  repoName = 'Repository',
): ScoreDiff {
  const ceilingDelta = head.ceiling - base.ceiling;
  const indexDelta = head.indexScore - base.indexScore;
  const isRegression = ceilingDelta < 0 || indexDelta < 0;

  const baseMap = new Map(base.results.map((r) => [r.id, r]));
  const dimensionDiffs: DimensionDiff[] = head.results.map((headDim) => {
    const baseDim = baseMap.get(headDim.id);
    const baseScore = baseDim ? baseDim.score : 0;
    return {
      id: headDim.id,
      label: headDim.label,
      baseScore,
      headScore: headDim.score,
      delta: headDim.score - baseScore,
    };
  });

  const lines: string[] = [];
  lines.push(`## 🤖 Agent Readiness Scorecard Diff for ${repoName}`);
  lines.push('');

  const statusEmoji = isRegression
    ? '⚠️ **Regression Detected**'
    : ceilingDelta > 0 || indexDelta > 0
      ? '🎉 **Readiness Improved!**'
      : '✅ **No Change**';
  lines.push(`Status: ${statusEmoji}`);
  lines.push('');

  const ceilingSign = ceilingDelta > 0 ? `+${ceilingDelta}` : `${ceilingDelta}`;
  const indexSign = indexDelta > 0 ? `+${indexDelta}` : `${indexDelta}`;

  lines.push(`| Metric | Base | Head | Change |`);
  lines.push('|:---|:---:|:---:|:---:|');
  lines.push(
    `| **Readiness Level** | ${base.level.name} (${base.ceiling}/5) | ${head.level.name} (${head.ceiling}/5) | ${ceilingDelta !== 0 ? `**${ceilingSign}**` : '0'} |`,
  );
  lines.push(
    `| **Readiness Index** | ${base.indexScore}/100 (${base.grade}) | ${head.indexScore}/100 (${head.grade}) | ${indexDelta !== 0 ? `**${indexSign}**` : '0'} |`,
  );
  lines.push('');

  lines.push('### Dimension Breakdown');
  lines.push('');
  lines.push('| Dimension | Base | Head | Change | Status |');
  lines.push('|:---|:---:|:---:|:---:|:---:|');

  for (const diff of dimensionDiffs) {
    const deltaStr = diff.delta > 0 ? `+${diff.delta}` : diff.delta < 0 ? `${diff.delta}` : '0';
    const icon = diff.delta > 0 ? '🟢 Improved' : diff.delta < 0 ? '🔴 Regressed' : '⚪ Unchanged';
    lines.push(
      `| **${diff.label}** | ${diff.baseScore}/5 | ${diff.headScore}/5 | ${deltaStr} | ${icon} |`,
    );
  }

  lines.push('');
  if (isRegression) {
    lines.push(
      '> ⚠️ **Attention**: One or more readiness dimensions regressed in this pull request. Review the priority remediations to maintain agent productivity.',
    );
  } else if (ceilingDelta > 0 || indexDelta > 0) {
    lines.push(
      '> 🚀 **Great job!** This pull request makes the codebase more accessible and deterministic for AI coding agents.',
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('*Automated scorecard diff by [repograder](https://github.com/Praashh/repograder)*');

  return {
    ceilingDelta,
    indexDelta,
    isRegression,
    dimensionDiffs,
    markdown: lines.join('\n'),
    terminal: renderTerminalDiff(
      {
        ceilingDelta,
        indexDelta,
        isRegression,
        dimensionDiffs,
        markdown: lines.join('\n'),
      },
      base,
      head,
      repoName,
    ),
  };
}
