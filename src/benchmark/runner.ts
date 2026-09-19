import { runAll } from '../score';
import { getModel } from './models';
import { calculateBenchmark } from './costModel';
import { harvestStaticIssues } from './harvester';
import { runLiveProbes } from './liveAgent';
import type { BenchmarkResult } from './types';

export interface BenchmarkRunnerOptions {
  model?: string;
  mode?: 'analytical' | 'live';
  sample?: number;
}

export async function runBenchmark(
  root: string,
  options: BenchmarkRunnerOptions = {},
): Promise<BenchmarkResult> {
  const model = getModel(options.model);
  const scanResult = runAll(root);
  const harvested = harvestStaticIssues(root, options.sample || 15);

  const baseBenchmark = calculateBenchmark(
    root,
    scanResult,
    model,
    harvested.issues.filter((i) => i.source !== 'probe').length,
  );

  // If live mode requested, run live agent probe calibration
  if (options.mode === 'live') {
    const liveSummary = await runLiveProbes(
      root,
      harvested.issues,
      model,
      Math.min(options.sample || 3, 5),
    );

    if (liveSummary) {
      baseBenchmark.mode = 'live';
      // Calibrate with live measurements
      const empiricalTokensIn = liveSummary.avgTokensIn;
      const empiricalTokensOut = liveSummary.avgTokensOut;

      // Adjust metrics
      baseBenchmark.metrics.tokensInPerIssue = empiricalTokensIn;
      baseBenchmark.metrics.tokensOutPerIssue = empiricalTokensOut;
      baseBenchmark.metrics.tokensPer1k = (empiricalTokensIn + empiricalTokensOut) * 1000;

      const liveCostPerIssue =
        (empiricalTokensIn / 1_000_000) * model.inputPricePerM +
        (empiricalTokensOut / 1_000_000) * model.outputPricePerM;
      baseBenchmark.metrics.costPer1kUsd = Number((liveCostPerIssue * 1000).toFixed(2));

      if (liveSummary.avgLatencyMs > 0) {
        baseBenchmark.metrics.secondsPerIssue = Number(
          (liveSummary.avgLatencyMs / 1000).toFixed(2),
        );
        baseBenchmark.metrics.timePer1kHours = Number(
          ((baseBenchmark.metrics.secondsPerIssue * 1000) / 3600).toFixed(2),
        );
      }
    }
  }

  return baseBenchmark;
}
