import type { Scanner, DimensionResult, Level, RunAllResult } from './types';
import * as tests from './scanners/tests';
import * as context from './scanners/context';
import * as fileSize from './scanners/fileSize';
import * as dependencies from './scanners/dependencies';
import * as standards from './scanners/standards';

const SCANNERS: Scanner[] = [tests, context, fileSize, dependencies, standards];

const LEVELS: Level[] = [
  { min: 1, max: 1, name: 'Not agent-ready' },
  { min: 2, max: 2, name: 'Fragile' },
  { min: 3, max: 3, name: 'Supervised' },
  { min: 4, max: 4, name: 'Capable' },
  { min: 5, max: 5, name: 'Autonomous-ready' },
];

function levelForScore(score: number): Level {
  return LEVELS.find((l) => score >= l.min && score <= l.max) ?? LEVELS[0];
}

function gradeForIndex(index: number): string {
  if (index >= 95) return 'A+';
  if (index >= 85) return 'A';
  if (index >= 75) return 'B';
  if (index >= 65) return 'C';
  if (index >= 50) return 'D';
  return 'F';
}

export function runAll(root: string): RunAllResult {
  const results: DimensionResult[] = SCANNERS.map((scanner) => {
    const { score, evidence, blocking, remediationTips } = scanner.scan(root);
    return { id: scanner.id, label: scanner.label, score, evidence, blocking, remediationTips };
  });

  const ceiling = Math.min(...results.map((r) => r.score));
  const level = levelForScore(ceiling);

  const totalScore = results.reduce((acc, r) => acc + r.score, 0);
  const maxPossible = results.length * 5;
  const indexScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;
  const grade = gradeForIndex(indexScore);

  // Remediation priority: blocking dimensions first, then ascending by score.
  const remediation = [...results].sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return a.score - b.score;
  });

  return { results, ceiling, level, indexScore, grade, remediation };
}

export { levelForScore, gradeForIndex, SCANNERS };
