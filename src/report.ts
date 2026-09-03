import type { RunAllResult } from './types';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

function colorForScore(score: number): string {
  if (score <= 2) return RED;
  if (score === 3) return YELLOW;
  return GREEN;
}

function bar(score: number, max = 5): string {
  const filled = '█'.repeat(score);
  const empty = '░'.repeat(max - score);
  return `${colorForScore(score)}${filled}${DIM}${empty}${RESET}`;
}

export function renderText({ results, ceiling, level, remediation }: RunAllResult, targetPath: string): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`${BOLD}Agent Readiness Scan${RESET}  ${DIM}${targetPath}${RESET}`);
  lines.push('');
  lines.push(
    `${BOLD}Readiness level: ${colorForScore(ceiling)}${level.name} (${ceiling}/5)${RESET}  ${DIM}— set by lowest-scoring dimension, not the average${RESET}`,
  );
  lines.push('');

  for (const r of results) {
    const flag = r.blocking ? `${DIM}[blocking]${RESET}` : '';
    lines.push(`  ${bar(r.score)}  ${BOLD}${r.score}/5${RESET}  ${r.label} ${flag}`);
    for (const line of r.evidence) {
      lines.push(`        ${DIM}${line}${RESET}`);
    }
    lines.push('');
  }

  lines.push(`${BOLD}${CYAN}Priority order for improvement:${RESET}`);
  remediation
    .filter((r) => r.score < 5)
    .slice(0, 5)
    .forEach((r, i) => {
      lines.push(
        `  ${i + 1}. ${r.label} (currently ${r.score}/5)${r.blocking ? DIM + '  — blocking dimension' + RESET : ''}`,
      );
    });
  if (remediation.every((r) => r.score === 5)) {
    lines.push(`  ${GREEN}All measured dimensions score 5/5.${RESET}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function renderJSON({ results, ceiling, level, remediation }: RunAllResult, targetPath: string): string {
  return JSON.stringify(
    {
      target: targetPath,
      scannedAt: new Date().toISOString(),
      readinessLevel: level.name,
      ceilingScore: ceiling,
      dimensions: results,
      remediationOrder: remediation.map((r) => r.id),
    },
    null,
    2,
  );
}
