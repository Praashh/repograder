import type { BenchmarkResult, BenchmarkDiff } from './types';
import { c } from '../ui/colors';
import { renderBox } from '../ui/box';

export function compareBenchmarks(
  base: BenchmarkResult,
  head: BenchmarkResult,
  headLabel = 'Head',
): BenchmarkDiff {
  const baseCost = base.metrics.costPer1kUsd;
  const headCost = head.metrics.costPer1kUsd;
  const costDeltaUsd = Number((headCost - baseCost).toFixed(2));
  const costDeltaPercent =
    baseCost > 0 ? Number((((headCost - baseCost) / baseCost) * 100).toFixed(1)) : 0;

  const baseTokens = base.metrics.tokensPer1k;
  const headTokens = head.metrics.tokensPer1k;
  const tokenDeltaPercent =
    baseTokens > 0 ? Number((((headTokens - baseTokens) / baseTokens) * 100).toFixed(1)) : 0;

  const baseTime = base.metrics.timePer1kHours;
  const headTime = head.metrics.timePer1kHours;
  const timeDeltaMinutes = Math.round((headTime - baseTime) * 60);

  const baseScore = base.metrics.friendlinessScore;
  const headScore = head.metrics.friendlinessScore;
  const scoreDelta = headScore - baseScore;

  const isImprovement = costDeltaUsd < 0 || scoreDelta > 0;

  // Terminal UI
  const termLines: string[] = [];
  const statusColor = isImprovement ? c.brightGreen : costDeltaUsd > 0 ? c.red : c.cyan;
  const statusText = isImprovement
    ? '🎉 AI Friendliness Improved!'
    : costDeltaUsd > 0
      ? '⚠️ Cost Regression Detected'
      : '✅ No Change in Benchmark Cost';

  termLines.push('');
  termLines.push(
    renderBox(
      [
        `${c.bold('AI Benchmark Comparison')} ${c.dim('for')} ${c.bold(head.repoName || headLabel)}`,
        `${statusColor(c.bold(statusText))} ${c.dim(
          `($/1k Issues: ${costDeltaUsd <= 0 ? '' : '+'}$${costDeltaUsd.toFixed(2)}, Score: ${
            scoreDelta >= 0 ? '+' : ''
          }${scoreDelta} pts)`,
        )}`,
      ],
      {
        style: 'rounded',
        borderColor: isImprovement ? c.green : costDeltaUsd > 0 ? c.red : c.cyan,
      },
    ),
  );
  termLines.push('');

  termLines.push(`  ${c.bold(c.white('KEY BENCHMARK METRICS (PER 1,000 ISSUES)'))}`);
  termLines.push(
    `  ${c.dim('Cost ($):')}          $${baseCost.toFixed(2)} → ${c.bold(
      `$${headCost.toFixed(2)}`,
    )}  ${
      costDeltaUsd < 0
        ? c.brightGreen(`(${costDeltaPercent}% savings)`)
        : costDeltaUsd > 0
          ? c.red(`(+${costDeltaPercent}% increase)`)
          : c.dim('(unchanged)')
    }`,
  );
  termLines.push(
    `  ${c.dim('Tokens:')}            ${(baseTokens / 1_000_000).toFixed(1)}M → ${c.bold(
      `${(headTokens / 1_000_000).toFixed(1)}M`,
    )}  ${
      tokenDeltaPercent < 0
        ? c.brightGreen(`(${tokenDeltaPercent}%)`)
        : tokenDeltaPercent > 0
          ? c.red(`(+${tokenDeltaPercent}%)`)
          : c.dim('(unchanged)')
    }`,
  );
  termLines.push(
    `  ${c.dim('Resolution Time:')}   ${baseTime.toFixed(1)}h → ${c.bold(
      `${headTime.toFixed(1)}h`,
    )}  ${
      timeDeltaMinutes < 0
        ? c.brightGreen(`(${Math.abs(timeDeltaMinutes)} min faster)`)
        : timeDeltaMinutes > 0
          ? c.red(`(+${timeDeltaMinutes} min slower)`)
          : c.dim('(unchanged)')
    }`,
  );
  termLines.push(
    `  ${c.dim('Friendliness Score:')} ${baseScore}/100 (${base.metrics.grade}) → ${c.bold(
      `${headScore}/100 (${head.metrics.grade})`,
    )}  ${
      scoreDelta > 0
        ? c.brightGreen(`(+${scoreDelta} pts)`)
        : scoreDelta < 0
          ? c.red(`(${scoreDelta} pts)`)
          : c.dim('(unchanged)')
    }`,
  );
  termLines.push('');

  // Markdown UI
  const mdLines: string[] = [
    `# ⚡ AI Friendliness Benchmark Diff`,
    '',
    `> **${statusText}**`,
    '',
    `| Metric (Per 1k Issues) | Base | Head | Delta |`,
    `| :--- | :--- | :--- | :--- |`,
    `| **Cost ($)** | $${baseCost.toFixed(2)} | **$${headCost.toFixed(2)}** | ${
      costDeltaUsd <= 0
        ? `🟢 -$${Math.abs(costDeltaUsd).toFixed(2)} (${costDeltaPercent}%)`
        : `🔴 +$${costDeltaUsd.toFixed(2)} (+${costDeltaPercent}%)`
    } |`,
    `| **Tokens** | ${(baseTokens / 1_000_000).toFixed(2)}M | **${(headTokens / 1_000_000).toFixed(2)}M** | ${
      tokenDeltaPercent <= 0 ? `🟢 ${tokenDeltaPercent}%` : `🔴 +${tokenDeltaPercent}%`
    } |`,
    `| **Resolution Time** | ${baseTime.toFixed(1)}h | **${headTime.toFixed(1)}h** | ${
      timeDeltaMinutes <= 0
        ? `🟢 ${Math.abs(timeDeltaMinutes)} min faster`
        : `🔴 +${timeDeltaMinutes} min slower`
    } |`,
    `| **AI Friendliness** | ${baseScore}/100 (${base.metrics.grade}) | **${headScore}/100 (${head.metrics.grade})** | ${
      scoreDelta >= 0 ? `🟢 +${scoreDelta} pts` : `🔴 ${scoreDelta} pts`
    } |`,
    '',
  ];

  return {
    baseCostPer1k: baseCost,
    headCostPer1k: headCost,
    costDeltaUsd,
    costDeltaPercent,
    baseTokensPer1k: baseTokens,
    headTokensPer1k: headTokens,
    tokenDeltaPercent,
    baseTimeHours: baseTime,
    headTimeHours: headTime,
    timeDeltaMinutes,
    baseScore,
    headScore,
    scoreDelta,
    isImprovement,
    terminal: termLines.join('\n'),
    markdown: mdLines.join('\n'),
  };
}
