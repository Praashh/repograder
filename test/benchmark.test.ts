import assert from 'assert';
import path from 'path';
import {
  getModel,
  calculateTokensCost,
  calculateBenchmark,
  harvestStaticIssues,
  generateSyntheticProbes,
  compareBenchmarks,
  renderBenchmarkTerminal,
  renderBenchmarkMarkdown,
  renderBenchmarkJSON,
  renderBenchmarkCompact,
  runBenchmark,
} from '../src/benchmark';
import { runAll } from '../src/score';

const repoRoot = path.resolve(__dirname, '../..');

// 1. Model Registry Tests
const sonnet = getModel('claude-3-5-sonnet');
assert.strictEqual(sonnet.inputPricePerM, 3.0);
assert.strictEqual(sonnet.outputPricePerM, 15.0);

const flash = getModel('flash');
assert.strictEqual(flash.id, 'gemini-2.0-flash');
assert.strictEqual(flash.inputPricePerM, 0.1);

const gpt4o = getModel('gpt4o');
assert.strictEqual(gpt4o.id, 'gpt-4o');

const custom = getModel('custom-model');
assert.strictEqual(custom.id, 'custom-model');

// Token cost math
const cost = calculateTokensCost(1_000_000, 1_000_000, sonnet);
assert.strictEqual(cost, 18.0); // 3 + 15

// 2. Cost Model & Benchmark Calculation Tests
const scanResult = runAll(repoRoot);
const result = calculateBenchmark(repoRoot, scanResult, sonnet);

assert.ok(result.metrics.costPer1kUsd > 0, 'costPer1kUsd should be positive');
assert.ok(result.metrics.tokensPer1k > 0, 'tokensPer1k should be positive');
assert.ok(result.metrics.timePer1kHours > 0, 'timePer1kHours should be positive');
assert.ok(result.metrics.turnsPerIssue >= 1.0, 'turnsPerIssue should be at least 1');
assert.ok(
  result.metrics.firstPassRate > 0 && result.metrics.firstPassRate <= 100,
  'firstPassRate between 0 and 100',
);
assert.ok(
  result.metrics.friendlinessScore >= 0 && result.metrics.friendlinessScore <= 100,
  'friendlinessScore between 0 and 100',
);
assert.ok(['A+', 'A', 'B', 'C', 'D', 'F'].includes(result.metrics.grade), 'valid grade');
assert.ok(Array.isArray(result.levers), 'levers should be an array');

// 3. Harvester & Synthetic Probes Tests
const harvest = harvestStaticIssues(repoRoot, 5);
assert.ok(Array.isArray(harvest.issues), 'harvested issues should be array');
assert.ok(harvest.sourceSummary.length > 0, 'harvest source summary present');

const probes = generateSyntheticProbes(repoRoot, 4);
assert.strictEqual(probes.length, 4, 'expected 4 synthetic probes');
probes.forEach((p) => {
  assert.strictEqual(p.source, 'probe');
  assert.ok(p.file.length > 0);
  assert.ok(p.message.length > 0);
});

// 4. Report Rendering Tests
const terminalOutput = renderBenchmarkTerminal(result);
assert.ok(terminalOutput.includes('REPOGRADER AI FRIENDLINESS BENCHMARK'));
assert.ok(terminalOutput.includes('COST / 1k ISSUES'));
assert.ok(terminalOutput.includes(result.metrics.costPer1kUsd.toFixed(2)));

const markdownOutput = renderBenchmarkMarkdown(result);
assert.ok(markdownOutput.includes('# ⚡ AI Friendliness Benchmark:'));
assert.ok(markdownOutput.includes('1,000 Static Issues Benchmark Workload'));

const jsonOutput = JSON.parse(renderBenchmarkJSON(result));
assert.strictEqual(jsonOutput.metrics.costPer1kUsd, result.metrics.costPer1kUsd);

const compactOutput = renderBenchmarkCompact(result);
assert.ok(compactOutput.includes('AI Friendliness'));
assert.ok(compactOutput.includes('Cost/1k:'));

// 5. Benchmark Diff Tests
const lowerCostResult = JSON.parse(JSON.stringify(result));
lowerCostResult.metrics.costPer1kUsd = Number((result.metrics.costPer1kUsd * 0.7).toFixed(2));
lowerCostResult.metrics.friendlinessScore = Math.min(100, result.metrics.friendlinessScore + 5);

const diff = compareBenchmarks(result, lowerCostResult, 'Optimized Branch');
assert.ok(diff.costDeltaUsd < 0, 'cost delta should be negative (savings)');
assert.ok(diff.isImprovement, 'should be marked as improvement');
assert.ok(diff.terminal.includes('AI Friendliness Improved'));
assert.ok(diff.markdown.includes('AI Friendliness Benchmark Diff'));

// 6. Async Runner Test
(async () => {
  const runnerResult = await runBenchmark(repoRoot, { model: 'flash' });
  assert.strictEqual(runnerResult.model.id, 'gemini-2.0-flash');
  assert.ok(runnerResult.metrics.costPer1kUsd < result.metrics.costPer1kUsd);
  console.log('benchmark tests passed.');
})().catch((err) => {
  console.error('benchmark test failure:', err);
  process.exit(1);
});
