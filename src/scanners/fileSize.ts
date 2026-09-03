import { walk, isSourceFile, countLines } from '../lib/walk';
import type { ScanResult } from '../types';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const lineCounts: number[] = [];

  walk(root, (abs) => {
    if (!isSourceFile(abs)) return;
    const lines = countLines(abs);
    if (lines != null) lineCounts.push(lines);
  });

  if (lineCounts.length === 0) {
    evidence.push('No recognized source files found to measure — check the target path.');
    return { score: 3, evidence, blocking: false };
  }

  lineCounts.sort((a, b) => a - b);
  const median = percentile(lineCounts, 0.5);
  const p90 = percentile(lineCounts, 0.9);
  const max = lineCounts[lineCounts.length - 1];
  const overThreshold = lineCounts.filter((n) => n > 500).length;
  const overPct = (overThreshold / lineCounts.length) * 100;

  evidence.push(
    `Scanned ${lineCounts.length} source files. Median ${median} lines, p90 ${p90}, max ${max}. ` +
      `${overThreshold} file(s) (${overPct.toFixed(1)}%) exceed 500 lines.`,
  );

  let score: number;
  if (median <= 150 && p90 <= 400 && overPct < 2) {
    score = 5;
  } else if (median <= 250 && p90 <= 600 && overPct < 5) {
    score = 4;
  } else if (median <= 400 && p90 <= 900 && overPct < 10) {
    score = 3;
  } else if (median <= 600 && overPct < 20) {
    score = 2;
  } else {
    score = 1;
  }

  return { score, evidence, blocking: false };
}

export const id = 'fileSize';
export const label = 'File & module legibility';
export { scan };
