import type { BenchmarkModel } from './types';

export const BENCHMARK_MODELS: Record<string, BenchmarkModel> = {
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    avgTurnLatencyMs: 2500,
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    inputPricePerM: 0.1,
    outputPricePerM: 0.4,
    avgTurnLatencyMs: 1200,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    inputPricePerM: 2.5,
    outputPricePerM: 10.0,
    avgTurnLatencyMs: 2200,
  },
  'claude-3-5-haiku': {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    inputPricePerM: 0.8,
    outputPricePerM: 4.0,
    avgTurnLatencyMs: 1400,
  },
  'deepseek-v3': {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'deepseek',
    inputPricePerM: 0.14,
    outputPricePerM: 0.28,
    avgTurnLatencyMs: 1800,
  },
  local: {
    id: 'local',
    name: 'Local / Ollama (Zero API Cost)',
    provider: 'local',
    inputPricePerM: 0.0,
    outputPricePerM: 0.0,
    avgTurnLatencyMs: 3500,
  },
};

export const DEFAULT_MODEL_ID = 'claude-3-5-sonnet';

export function getModel(modelId?: string): BenchmarkModel {
  if (!modelId) return BENCHMARK_MODELS[DEFAULT_MODEL_ID];
  const normalized = modelId.toLowerCase().trim();

  // Direct match or alias
  if (BENCHMARK_MODELS[normalized]) {
    return BENCHMARK_MODELS[normalized];
  }

  // Aliases
  if (normalized === 'sonnet' || normalized === 'claude') {
    return BENCHMARK_MODELS['claude-3-5-sonnet'];
  }
  if (normalized === 'flash' || normalized === 'gemini') {
    return BENCHMARK_MODELS['gemini-2.0-flash'];
  }
  if (normalized === 'gpt4o' || normalized === 'openai' || normalized === '4o') {
    return BENCHMARK_MODELS['gpt-4o'];
  }
  if (normalized === 'haiku') {
    return BENCHMARK_MODELS['claude-3-5-haiku'];
  }
  if (normalized === 'deepseek') {
    return BENCHMARK_MODELS['deepseek-v3'];
  }
  if (normalized === 'ollama') {
    return BENCHMARK_MODELS['local'];
  }

  // Fallback to default
  return {
    id: modelId,
    name: modelId,
    provider: 'custom',
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    avgTurnLatencyMs: 2500,
  };
}

export function calculateTokensCost(
  tokensIn: number,
  tokensOut: number,
  model: BenchmarkModel,
): number {
  const inCost = (tokensIn / 1_000_000) * model.inputPricePerM;
  const outCost = (tokensOut / 1_000_000) * model.outputPricePerM;
  return inCost + outCost;
}
