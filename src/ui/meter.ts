import { c } from './colors';

export function getScoreColor(score: number): (s: string | number) => string {
  if (score >= 5) return c.brightGreen;
  if (score >= 4) return c.green;
  if (score === 3) return c.yellow;
  return c.red;
}

export function getGradeColor(grade: string): (s: string | number) => string {
  if (grade.startsWith('A')) return c.brightGreen;
  if (grade.startsWith('B')) return c.cyan;
  if (grade.startsWith('C')) return c.yellow;
  return c.red;
}

export function renderScoreMeter(score: number, max = 5): string {
  const color = getScoreColor(score);
  const filled = '■'.repeat(Math.max(0, Math.min(score, max)));
  const empty = '□'.repeat(Math.max(0, max - score));
  return `${color(filled)}${c.gray(empty)}`;
}

export function renderProgressBar(value: number, max = 100, width = 16): string {
  const ratio = Math.max(0, Math.min(1, value / max));
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;

  const color = value >= 80 ? c.brightGreen : value >= 60 ? c.yellow : c.red;
  const filled = '■'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);

  return `${c.gray('[')}${color(filled)}${c.gray(empty)}${c.gray(']')}`;
}

export function renderGradePill(grade: string): string {
  const color = getGradeColor(grade);
  return color(c.bold(c.inverse(` ${grade} `)));
}

export function renderStatusIcon(score: number): string {
  if (score >= 5) return c.brightGreen('✔');
  if (score >= 4) return c.green('●');
  if (score === 3) return c.yellow('▲');
  return c.red('✖');
}

export function renderScorePill(score: number, max = 5): string {
  const color = getScoreColor(score);
  return color(c.bold(`${score}/${max}`));
}
