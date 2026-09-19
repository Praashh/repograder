export type BenchmarkMode = 'analytical' | 'live';

export interface BenchmarkModel {
  id: string;
  name: string;
  provider: 'anthropic' | 'google' | 'openai' | 'deepseek' | 'local' | 'custom';
  inputPricePerM: number;
  outputPricePerM: number;
  avgTurnLatencyMs: number;
}

export interface StaticIssue {
  id: string;
  file: string;
  line: number;
  column?: number;
  rule?: string;
  message: string;
  source: 'tsc' | 'eslint' | 'ruff' | 'mypy' | 'probe' | 'generic';
  snippet?: string;
}

export interface CostBreakdown {
  baseContextCostUsd: number;
  explorationCostUsd: number;
  fileBloatCostUsd: number;
  retryCostUsd: number;
}

export interface OptimizationLever {
  id: string;
  title: string;
  description: string;
  projectedSavingsUsdPer1k: number;
  projectedTimeSavedMinutesPer1k: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface BenchmarkMetrics {
  costPer1kUsd: number;
  tokensPer1k: number;
  timePer1kHours: number;
  turnsPerIssue: number;
  firstPassRate: number; // 0 to 100 percentage
  friendlinessScore: number; // 0 to 100
  grade: string; // A+, A, B, C, D, F
  tokensInPerIssue: number;
  tokensOutPerIssue: number;
  secondsPerIssue: number;
}

export interface BenchmarkResult {
  repoName: string;
  targetPath: string;
  timestamp: string;
  mode: BenchmarkMode;
  model: BenchmarkModel;
  metrics: BenchmarkMetrics;
  breakdown: CostBreakdown;
  levers: OptimizationLever[];
  sampleIssuesCount: number;
  activeIssuesFound: number;
  dimensionScores: Record<string, number>;
}

export interface BenchmarkDiff {
  baseCostPer1k: number;
  headCostPer1k: number;
  costDeltaUsd: number;
  costDeltaPercent: number;
  baseTokensPer1k: number;
  headTokensPer1k: number;
  tokenDeltaPercent: number;
  baseTimeHours: number;
  headTimeHours: number;
  timeDeltaMinutes: number;
  baseScore: number;
  headScore: number;
  scoreDelta: number;
  isImprovement: boolean;
  terminal: string;
  markdown: string;
}
