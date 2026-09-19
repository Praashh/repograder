import type { RunAllResult } from './types';
import { c } from './ui/colors';
import { renderBox } from './ui/box';
import {
  getScoreColor,
  renderScoreMeter,
  renderProgressBar,
  renderGradePill,
  renderStatusIcon,
  renderScorePill,
} from './ui/meter';

function hexColorForScore(score: number): string {
  if (score <= 2) return 'red';
  if (score === 3) return 'yellow';
  if (score === 4) return 'green';
  return 'brightgreen';
}

export function renderCompactText(
  { results, ceiling, level, indexScore, grade }: RunAllResult,
  targetPath: string,
): string {
  const ceilingColor = getScoreColor(ceiling);
  const indexColor = getScoreColor(Math.round(indexScore / 20));
  const gradePill = renderGradePill(grade);
  const bottlenecks = results.filter((r) => r.score === ceiling).map((r) => r.label);

  const dimPills = results
    .map((r) => `${renderStatusIcon(r.score)} ${r.id}: ${renderScorePill(r.score)}`)
    .join('  ');

  return [
    `${c.bold(c.cyan('repograder'))} ${c.dim(targetPath)}  ${ceilingColor(c.bold(`${level.name} (${ceiling}/5)`))}  Index: ${indexColor(`${indexScore}/100`)} ${gradePill}  ${c.dim('Bottleneck:')} ${c.yellow(bottlenecks[0] || 'none')}`,
    `  ${dimPills}`,
  ].join('\n');
}

export function renderText(
  { results, ceiling, level, indexScore, grade, remediation }: RunAllResult,
  targetPath: string,
): string {
  const lines: string[] = [];
  const ceilingColor = getScoreColor(ceiling);
  const indexColor = getScoreColor(Math.round(indexScore / 20));
  const gradePill = renderGradePill(grade);
  const progressBar = renderProgressBar(indexScore, 100, 14);

  // Bottleneck detection
  const bottlenecks = results.filter((r) => r.score === ceiling);
  const bottleneckNames = bottlenecks.map((b) => b.label).join(', ');

  lines.push('');
  lines.push(
    renderBox(
      [
        `${c.bold(c.cyan('REPOGRADER'))} ${c.dim('—')} ${c.bold('Agent Readiness Scan')}   ${c.dim(targetPath)}`,
      ],
      { style: 'rounded', padding: 1, borderColor: c.cyan },
    ),
  );
  lines.push('');

  const scorecardLines: string[] = [
    '',
    `  ${c.dim('READINESS LEVEL')}          ${c.dim('READINESS INDEX')}          ${c.dim('OVERALL GRADE')}`,
    `  ${ceilingColor(c.bold(`${level.name} (${ceiling}/5)`))}    Index: ${progressBar} ${indexColor(c.bold(`${indexScore}/100`))}    ${gradePill}`,
    `  ${c.dim('Ceiling: ' + ceiling + '/5')}                                            `,
    '',
    bottlenecks.length > 0 && ceiling < 5
      ? `  ${c.yellow('▲')} ${c.bold('Ceiling Bottleneck:')} ${c.yellow(bottleneckNames)} (${ceiling}/5)`
      : `  ${c.brightGreen('✔')} ${c.bold('All dimensions at maximum readiness. Autonomous-ready!')}`,
    `  ${c.dim('Readiness level is governed by the lowest dimension (Weakest Link).')}`,
    '',
  ];

  lines.push(
    renderBox(scorecardLines, {
      title: c.bold(' SCORECARD '),
      style: 'rounded',
      borderColor: c.gray,
      padding: 1,
    }),
  );
  lines.push('');

  lines.push(`  ${c.bold(c.white('DIMENSION BREAKDOWN'))}`);
  lines.push('');

  for (const r of results) {
    const icon = renderStatusIcon(r.score);
    const scorePill = renderScorePill(r.score);
    const meter = renderScoreMeter(r.score, 5);
    const blockingBadge = r.blocking ? ` ${c.bold(c.inverse(c.yellow(' BLOCKING ')))}` : '';

    lines.push(`  ${icon} ${scorePill}  ${meter}  ${c.bold(r.label)}${blockingBadge}`);

    // Tree structured evidence
    const allItems: { text: string; isTip?: boolean }[] = [];
    for (const ev of r.evidence) {
      allItems.push({ text: ev, isTip: false });
    }
    if (r.remediationTips && r.remediationTips.length > 0 && r.score < 5) {
      for (const tip of r.remediationTips) {
        allItems.push({ text: tip, isTip: true });
      }
    }

    for (let i = 0; i < allItems.length; i++) {
      const isLast = i === allItems.length - 1;
      const branch = isLast ? '└─' : '├─';
      const item = allItems[i];
      if (item.isTip) {
        lines.push(`         ${c.dim(branch)} ${c.cyan(c.bold('⚡ Fix:'))} ${c.cyan(item.text)}`);
      } else {
        lines.push(`         ${c.dim(branch)} ${c.dim(item.text)}`);
      }
    }
    lines.push('');
  }

  const needsFix = remediation.filter((r) => r.score < 5);
  if (needsFix.length === 0) {
    lines.push(
      renderBox(
        [
          `🎉 ${c.bold(c.brightGreen('All measured dimensions score 5/5. Repository is autonomous-ready!'))}`,
        ],
        { style: 'rounded', borderColor: c.green, padding: 2 },
      ),
    );
  } else {
    const roadmapLines: string[] = [''];
    needsFix.slice(0, 5).forEach((r, i) => {
      const tip =
        r.remediationTips && r.remediationTips[0]
          ? r.remediationTips[0]
          : 'Improve configurations to meet agent readiness benchmarks.';
      const blockingTag = r.blocking ? ` ${c.yellow('[BLOCKING]')}` : '';
      roadmapLines.push(
        `  ${c.bold(`${i + 1}. ${r.label}`)} ${c.dim(`(currently ${r.score}/5)`)}${blockingTag}`,
      );
      roadmapLines.push(`     ${c.cyan('Action:')} ${tip}`);
      if (r.score === ceiling) {
        roadmapLines.push(
          `     ${c.green('Impact:')} ${c.bold('Unlocks next readiness level ceiling!')}`,
        );
      }
      roadmapLines.push('');
    });

    lines.push(
      renderBox(roadmapLines, {
        title: c.bold(c.yellow(' ⚡ PRIORITY REMEDIATION ROADMAP ')),
        style: 'rounded',
        borderColor: c.yellow,
        padding: 1,
      }),
    );
  }

  lines.push('');
  lines.push(
    `  ${c.dim('💡 Tip: Run')} ${c.cyan('repograder fix')} ${c.dim('to automatically scaffold missing stubs and ignore rules.')}`,
  );
  lines.push('');

  return lines.join('\n');
}

export function renderJSON(
  { results, ceiling, level, indexScore, grade, remediation }: RunAllResult,
  targetPath: string,
): string {
  return JSON.stringify(
    {
      target: targetPath,
      scannedAt: new Date().toISOString(),
      readinessLevel: level.name,
      ceilingScore: ceiling,
      indexScore,
      grade,
      dimensions: results,
      remediationOrder: remediation.map((r) => ({
        id: r.id,
        score: r.score,
        blocking: r.blocking,
        remediationTips: r.remediationTips ?? [],
      })),
    },
    null,
    2,
  );
}

export function renderMarkdown(
  { results, ceiling, level, indexScore, grade, remediation }: RunAllResult,
  targetPath: string,
): string {
  const lines: string[] = [];
  lines.push('# 🤖 Agent Readiness Report');
  lines.push('');
  lines.push(`**Target**: \`${targetPath}\`  `);
  lines.push(`**Scanned at**: ${new Date().toUTCString()}  `);
  lines.push(
    `**Readiness Level**: **${level.name} (${ceiling}/5)** &nbsp;|&nbsp; **Readiness Index**: **${indexScore}/100 (${grade})**`,
  );
  lines.push('');
  lines.push(
    '> *Readiness level is governed by the Weakest Link Principle (minimum score across dimensions).*',
  );
  lines.push('');
  lines.push('### Score Breakdown');
  lines.push('');
  lines.push('| Dimension | Score | Status | Key Evidence |');
  lines.push('|:---|:---:|:---:|:---|');

  for (const r of results) {
    const icon = r.score >= 4 ? '✅' : r.score === 3 ? '⚠️' : '❌';
    const blockingBadge = r.blocking ? ' *(blocking)*' : '';
    const evidenceSummary = r.evidence.join('<br>');
    lines.push(`| **${r.label}**${blockingBadge} | ${r.score}/5 | ${icon} | ${evidenceSummary} |`);
  }

  lines.push('');
  lines.push('### 🛠️ Priority Remediation Actions');
  lines.push('');

  const needsFix = remediation.filter((r) => r.score < 5);
  if (needsFix.length === 0) {
    lines.push('🎉 **All measured dimensions score 5/5! Repository is autonomous-ready.**');
  } else {
    needsFix.forEach((r, i) => {
      const blockingNotice = r.blocking ? ' **[Blocking Dimension]**' : '';
      lines.push(`${i + 1}. **${r.label}** (Score: ${r.score}/5)${blockingNotice}`);
      if (r.remediationTips && r.remediationTips.length > 0) {
        for (const tip of r.remediationTips) {
          lines.push(`   - 💡 ${tip}`);
        }
      }
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('*Generated by [repograder](https://github.com/Praashh/repograder)*');
  lines.push('');

  return lines.join('\n');
}

export function renderBadge({ ceiling, level }: RunAllResult): string {
  return JSON.stringify({
    schemaVersion: 1,
    label: 'agent readiness',
    message: `${level.name} (${ceiling}/5)`,
    color: hexColorForScore(ceiling),
  });
}

export function renderSARIF({ results }: RunAllResult, _targetPath: string): string {
  const rules = [];
  const sarifResults = [];

  for (const r of results) {
    const ruleId = `REPO-${r.id}`;
    rules.push({
      id: ruleId,
      name: r.id,
      shortDescription: {
        text: r.label,
      },
      fullDescription: {
        text: `Evaluates ${r.label} for AI coding agent readiness.`,
      },
      defaultConfiguration: {
        level: r.blocking || r.score <= 2 ? 'error' : r.score === 3 ? 'warning' : 'note',
      },
      help: {
        text:
          r.remediationTips && r.remediationTips.length > 0
            ? r.remediationTips.join('\n')
            : `Improve ${r.label} to achieve autonomous agent readiness.`,
      },
    });

    if (r.score < 5) {
      const level = r.blocking || r.score <= 2 ? 'error' : r.score === 3 ? 'warning' : 'note';
      const evidenceStr = r.evidence.join('; ');
      const tipStr =
        r.remediationTips && r.remediationTips.length > 0
          ? ` Remediation: ${r.remediationTips.join(' | ')}`
          : '';
      sarifResults.push({
        ruleId,
        level,
        message: {
          text: `[${r.label}] Score ${r.score}/5: ${evidenceStr}.${tipStr}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: '.',
                uriBaseId: '%SRCROOT%',
              },
              region: {
                startLine: 1,
                startColumn: 1,
              },
            },
          },
        ],
      });
    }
  }

  const sarifLog = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'repograder',
            version: '0.1.4',
            informationUri: 'https://github.com/Praashh/repograder',
            rules,
          },
        },
        results: sarifResults,
      },
    ],
  };

  return JSON.stringify(sarifLog, null, 2);
}

export function renderCodeClimate({ results }: RunAllResult, _targetPath: string): string {
  const issues = [];
  for (const r of results) {
    if (r.score < 5) {
      const severity =
        r.blocking || r.score <= 1
          ? 'blocker'
          : r.score === 2
            ? 'critical'
            : r.score === 3
              ? 'major'
              : 'minor';
      issues.push({
        type: 'issue',
        check_name: `repograder/${r.id}`,
        description: `[${r.label}] (Score ${r.score}/5): ${r.evidence[0] || 'Suboptimal score'}`,
        content: {
          body:
            r.remediationTips && r.remediationTips.length > 0
              ? r.remediationTips.map((t) => `- ${t}`).join('\n')
              : r.evidence.join('\n'),
        },
        categories: ['Bug Risk', 'Clarity'],
        severity,
        location: {
          path: '.',
          lines: {
            begin: 1,
          },
        },
      });
    }
  }
  return JSON.stringify(issues, null, 2);
}
