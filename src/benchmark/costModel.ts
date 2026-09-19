import type { RunAllResult } from '../types';
import type {
  BenchmarkModel,
  BenchmarkMetrics,
  CostBreakdown,
  OptimizationLever,
  BenchmarkResult,
} from './types';
import { calculateTokensCost } from './models';
import { walk, isSourceFile, countLines } from '../lib/walk';
import path from 'path';

export interface CodebaseFileStats {
  fileCount: number;
  totalLines: number;
  avgLines: number;
  medianLines: number;
  p90Lines: number;
  maxLines: number;
  filesOver500: number;
  avgFileTokens: number;
}

export function analyzeFileStats(root: string): CodebaseFileStats {
  const lineCounts: number[] = [];
  walk(
    root,
    (abs) => {
      if (!isSourceFile(abs)) return;
      const lines = countLines(abs);
      if (lines != null && lines > 0) {
        lineCounts.push(lines);
      }
    },
    { maxFiles: 2000 },
  );

  if (lineCounts.length === 0) {
    return {
      fileCount: 1,
      totalLines: 150,
      avgLines: 150,
      medianLines: 150,
      p90Lines: 150,
      maxLines: 150,
      filesOver500: 0,
      avgFileTokens: 975,
    };
  }

  lineCounts.sort((a, b) => a - b);
  const fileCount = lineCounts.length;
  const totalLines = lineCounts.reduce((sum, n) => sum + n, 0);
  const avgLines = Math.round(totalLines / fileCount);
  const medianLines = lineCounts[Math.floor(fileCount * 0.5)];
  const p90Lines = lineCounts[Math.min(fileCount - 1, Math.floor(fileCount * 0.9))];
  const maxLines = lineCounts[fileCount - 1];
  const filesOver500 = lineCounts.filter((n) => n > 500).length;

  // Code token density: approximately 6.5 tokens per line of code
  const avgFileTokens = Math.max(250, Math.round(avgLines * 6.5));

  return {
    fileCount,
    totalLines,
    avgLines,
    medianLines,
    p90Lines,
    maxLines,
    filesOver500,
    avgFileTokens,
  };
}

export function calculateBenchmark(
  root: string,
  scanResult: RunAllResult,
  model: BenchmarkModel,
  activeIssuesFound = 0,
): BenchmarkResult {
  const fileStats = analyzeFileStats(root);

  // Extract dimension scores (1-5)
  const scores: Record<string, number> = {};
  for (const dim of scanResult.results) {
    scores[dim.id] = dim.score;
  }
  const contextScore = scores['context'] ?? 3;
  const fileSizeScore = scores['fileSize'] ?? 3;
  const typeSafetyScore = scores['typeSafety'] ?? 3;
  const standardsScore = scores['standards'] ?? 3;
  const testsScore = scores['tests'] ?? 3;

  // 1. Exploration Tax (turns spent searching for conventions, build commands, file paths)
  // Context score 5 = 0 exploration turns; Context score 1 = ~2.6 exploration turns
  const explorationTurns = Math.max(0, (5 - contextScore) * 0.65);
  const explorationTokensInPerTurn = 2100;
  const explorationTokensOutPerTurn = 120;

  // 2. Target File Ingestion & File Bloat
  // Ideal modular target file baseline is ~120 lines (~780 tokens)
  const idealFileTokens = 780;
  const actualTargetTokens = Math.max(idealFileTokens, fileStats.avgFileTokens);
  const fileBloatTokens = Math.max(0, actualTargetTokens - idealFileTokens);

  // 3. Verification & Retry Probability (P_first_pass)
  // Driven primarily by type safety (60%) and standards/linters (40%)
  const verificationScore = typeSafetyScore * 0.6 + standardsScore * 0.4;
  // Ranges from ~42% (score 1) to ~92% (score 5)
  const firstPassProb = Math.min(0.95, Math.max(0.35, 0.35 + (verificationScore / 5.0) * 0.57));
  const resolutionTurns = 1 / firstPassProb; // e.g. 1.09 turns at score 5, 2.38 turns at score 1

  const totalTurnsPerIssue = explorationTurns + resolutionTurns;

  // 4. Base Context Ingestion
  const baseSystemTokens = 1400; // System instructions, AGENTS.md core rules, diagnostic error
  const historyCarryoverTokens = 850; // History tokens per retry turn

  // 5. Token Calculation per Issue
  const explorationIn = explorationTurns * explorationTokensInPerTurn;
  const explorationOut = explorationTurns * explorationTokensOutPerTurn;

  const resolutionIn =
    baseSystemTokens +
    resolutionTurns * actualTargetTokens +
    Math.max(0, resolutionTurns - 1) * historyCarryoverTokens;
  const resolutionOut = resolutionTurns * 280; // Code patch & explanation

  const tokensInPerIssue = Math.round(explorationIn + resolutionIn);
  const tokensOutPerIssue = Math.round(explorationOut + resolutionOut);
  const tokensPerIssue = tokensInPerIssue + tokensOutPerIssue;

  // 6. Dollar Cost Calculations
  const costPerIssueUsd = calculateTokensCost(tokensInPerIssue, tokensOutPerIssue, model);
  const costPer1kUsd = Number((costPerIssueUsd * 1000).toFixed(2));

  // Ideal cost (Score 5 across all dimensions, modular files)
  const idealTokensIn = baseSystemTokens + 1.08 * idealFileTokens;
  const idealTokensOut = 1.08 * 280;
  const idealCostPer1k = calculateTokensCost(idealTokensIn, idealTokensOut, model) * 1000;

  // Breakdown of cost contributors ($ per 1k issues)
  const explorationCostUsd = Number(
    (calculateTokensCost(explorationIn, explorationOut, model) * 1000).toFixed(2),
  );
  const fileBloatCostUsd = Number(
    (((fileBloatTokens * resolutionTurns) / 1_000_000) * model.inputPricePerM * 1000).toFixed(2),
  );
  const retryTurnsOverIdeal = Math.max(0, resolutionTurns - 1.08);
  const retryCostUsd = Number(
    (
      ((retryTurnsOverIdeal * (actualTargetTokens + historyCarryoverTokens)) / 1_000_000) *
        model.inputPricePerM *
        1000 +
      ((retryTurnsOverIdeal * 280) / 1_000_000) * model.outputPricePerM * 1000
    ).toFixed(2),
  );
  const baseContextCostUsd = Number(
    Math.max(0, costPer1kUsd - (explorationCostUsd + fileBloatCostUsd + retryCostUsd)).toFixed(2),
  );

  // 7. Latency and Time Modeling
  // Verification latency per turn (running lint / typecheck)
  const verificationLatencySec = 0.4 + (5 - testsScore) * 0.9 + (5 - standardsScore) * 0.5;
  const llmLatencySec = model.avgTurnLatencyMs / 1000;

  const secondsPerIssue =
    explorationTurns * (llmLatencySec + 0.3) +
    resolutionTurns * (llmLatencySec + verificationLatencySec);
  const timePer1kHours = Number(((secondsPerIssue * 1000) / 3600).toFixed(2));

  // 8. AI Friendliness Score (0-100) & Grade
  // Benchmark Index: 100 is ideal ($10-$15 / 1k issues, ~1h resolution, 1.1 turns)
  const costRatio = Math.max(1, costPer1kUsd / Math.max(1, idealCostPer1k));
  let friendlinessScore = Math.round(100 / costRatio);
  friendlinessScore = Math.max(5, Math.min(100, friendlinessScore));

  let grade = 'F';
  if (friendlinessScore >= 90) grade = 'A+';
  else if (friendlinessScore >= 80) grade = 'A';
  else if (friendlinessScore >= 70) grade = 'B';
  else if (friendlinessScore >= 60) grade = 'C';
  else if (friendlinessScore >= 50) grade = 'D';

  // 9. Actionable Optimization Levers (ROI Roadmap)
  const levers: OptimizationLever[] = [];

  // Lever: Context / AGENTS.md
  if (contextScore < 5) {
    const savingsRatio = explorationCostUsd * 0.85;
    if (savingsRatio > 0.5) {
      levers.push({
        id: 'agents-md-specs',
        title: 'Document build commands & architecture in AGENTS.md',
        description: `Eliminates ~${explorationTurns.toFixed(1)} exploration turns per issue by giving agents immediate project context.`,
        projectedSavingsUsdPer1k: Number(savingsRatio.toFixed(2)),
        projectedTimeSavedMinutesPer1k: Math.round((explorationTurns * 2.8 * 1000) / 60),
        difficulty: 'easy',
      });
    }
  }

  // Lever: Monolithic files / file size
  if (fileBloatCostUsd > 1.0 || fileStats.filesOver500 > 0 || fileSizeScore < 4) {
    levers.push({
      id: 'modularize-large-files',
      title: `Decompose ${fileStats.filesOver500 > 0 ? fileStats.filesOver500 : 'large'} monolithic file(s) into submodules`,
      description: `Reduces prompt context ingestion by up to ~${fileBloatTokens} tokens per turn.`,
      projectedSavingsUsdPer1k: Number((fileBloatCostUsd * 0.8).toFixed(2)),
      projectedTimeSavedMinutesPer1k: Math.round(fileBloatCostUsd * 2.5),
      difficulty: 'medium',
    });
  }

  // Lever: Strict Type Safety
  if (typeSafetyScore < 5) {
    const potentialRetrySavings = retryCostUsd * 0.65;
    if (potentialRetrySavings > 0.5) {
      levers.push({
        id: 'strict-type-safety',
        title: 'Enable strict type checking (strict: true / noImplicitAny)',
        description: `Lifts first-pass resolution rate from ${(firstPassProb * 100).toFixed(0)}% to ~90%, preventing costly hallucination retry loops.`,
        projectedSavingsUsdPer1k: Number(potentialRetrySavings.toFixed(2)),
        projectedTimeSavedMinutesPer1k: Math.round(
          ((resolutionTurns - 1.1) * verificationLatencySec * 1000) / 60,
        ),
        difficulty: 'medium',
      });
    }
  }

  // Lever: Fast linter & pre-commit
  if (standardsScore < 5) {
    levers.push({
      id: 'fast-linter-tooling',
      title: 'Configure automated standards tooling (ESLint / Biome / Ruff)',
      description:
        'Provides exact line and column diagnostics so agents identify and fix violations in 1 turn.',
      projectedSavingsUsdPer1k: Number(Math.max(1.2, retryCostUsd * 0.35).toFixed(2)),
      projectedTimeSavedMinutesPer1k: Math.round((verificationLatencySec * 0.4 * 1000) / 60),
      difficulty: 'easy',
    });
  }

  // Sort levers by projected $ savings descending
  levers.sort((a, b) => b.projectedSavingsUsdPer1k - a.projectedSavingsUsdPer1k);

  const metrics: BenchmarkMetrics = {
    costPer1kUsd,
    tokensPer1k: Math.round(tokensPerIssue * 1000),
    timePer1kHours,
    turnsPerIssue: Number(totalTurnsPerIssue.toFixed(2)),
    firstPassRate: Math.round(firstPassProb * 100),
    friendlinessScore,
    grade,
    tokensInPerIssue,
    tokensOutPerIssue,
    secondsPerIssue: Number(secondsPerIssue.toFixed(2)),
  };

  const breakdown: CostBreakdown = {
    baseContextCostUsd,
    explorationCostUsd,
    fileBloatCostUsd,
    retryCostUsd,
  };

  return {
    repoName: path.basename(root) || 'Codebase',
    targetPath: root,
    timestamp: new Date().toISOString(),
    mode: 'analytical',
    model,
    metrics,
    breakdown,
    levers,
    sampleIssuesCount: 1000,
    activeIssuesFound,
    dimensionScores: scores,
  };
}
