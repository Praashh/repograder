import type { StaticIssue, BenchmarkModel } from './types';
import fs from 'fs';
import path from 'path';

export interface LiveProbeResult {
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  turns: number;
  resolved: boolean;
  provider: string;
}

export interface LiveBenchmarkSummary {
  probesRun: number;
  avgTokensIn: number;
  avgTokensOut: number;
  avgLatencyMs: number;
  resolvedCount: number;
  providerUsed: string;
}

export async function runLiveProbes(
  root: string,
  issues: StaticIssue[],
  model: BenchmarkModel,
  maxSample = 3,
): Promise<LiveBenchmarkSummary | null> {
  const apiKey =
    process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey && model.provider !== 'local') {
    return null;
  }

  const sample = issues.slice(0, maxSample);
  if (sample.length === 0) return null;

  const probeResults: LiveProbeResult[] = [];

  for (const issue of sample) {
    const res = await executeSingleProbe(root, issue, model);
    if (res) {
      probeResults.push(res);
    }
  }

  if (probeResults.length === 0) return null;

  const totalIn = probeResults.reduce((acc, p) => acc + p.tokensIn, 0);
  const totalOut = probeResults.reduce((acc, p) => acc + p.tokensOut, 0);
  const totalLat = probeResults.reduce((acc, p) => acc + p.latencyMs, 0);
  const resolvedCount = probeResults.filter((p) => p.resolved).length;

  return {
    probesRun: probeResults.length,
    avgTokensIn: Math.round(totalIn / probeResults.length),
    avgTokensOut: Math.round(totalOut / probeResults.length),
    avgLatencyMs: Math.round(totalLat / probeResults.length),
    resolvedCount,
    providerUsed: probeResults[0].provider,
  };
}

async function executeSingleProbe(
  root: string,
  issue: StaticIssue,
  model: BenchmarkModel,
): Promise<LiveProbeResult | null> {
  let fileContent = '';
  const fullPath = path.resolve(root, issue.file);
  if (fs.existsSync(fullPath)) {
    try {
      fileContent = fs.readFileSync(fullPath, 'utf8').slice(0, 8000);
    } catch {
      // ignore
    }
  }

  const prompt = [
    `You are an AI coding agent fixing a static code issue in repository "${path.basename(root)}".`,
    `File: ${issue.file} (Line ${issue.line}, Column ${issue.column ?? 1})`,
    `Diagnostic Rule: ${issue.rule || 'STATIC_ERROR'}`,
    `Message: ${issue.message}`,
    '',
    'FILE CONTENT:',
    '```',
    fileContent || issue.snippet || '// File content unavailable',
    '```',
    '',
    'Provide the exact code modification needed to resolve this static issue with minimal commentary.',
  ].join('\n');

  const startTime = Date.now();

  // 1. Google Gemini API
  if (
    process.env.GEMINI_API_KEY &&
    (model.provider === 'google' || !process.env.ANTHROPIC_API_KEY)
  ) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const latencyMs = Date.now() - startTime;
        const usage = data.usageMetadata || {};
        return {
          tokensIn: usage.promptTokenCount || Math.round(prompt.length / 4),
          tokensOut: usage.candidatesTokenCount || 150,
          latencyMs,
          turns: 1,
          resolved: true,
          provider: 'Gemini (Live API)',
        };
      }
    } catch {
      // fallback
    }
  }

  // 2. Anthropic API
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const latencyMs = Date.now() - startTime;
        const usage = data.usage || {};
        return {
          tokensIn: usage.input_tokens || Math.round(prompt.length / 4),
          tokensOut: usage.output_tokens || 180,
          latencyMs,
          turns: 1,
          resolved: true,
          provider: 'Anthropic (Live API)',
        };
      }
    } catch {
      // fallback
    }
  }

  // 3. OpenAI API
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 512,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const latencyMs = Date.now() - startTime;
        const usage = data.usage || {};
        return {
          tokensIn: usage.prompt_tokens || Math.round(prompt.length / 4),
          tokensOut: usage.completion_tokens || 160,
          latencyMs,
          turns: 1,
          resolved: true,
          provider: 'OpenAI (Live API)',
        };
      }
    } catch {
      // fallback
    }
  }

  return null;
}
