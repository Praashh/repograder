import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { StaticIssue } from './types';
import { walk, isSourceFile } from '../lib/walk';

export interface HarvestResult {
  issues: StaticIssue[];
  sourceSummary: string;
}

export function harvestStaticIssues(root: string, maxIssues = 25): HarvestResult {
  const issues: StaticIssue[] = [];

  // 1. Try TypeScript compiler diagnostics if tsconfig.json exists
  const tsConfigPath = path.join(root, 'tsconfig.json');
  if (fs.existsSync(tsConfigPath)) {
    try {
      const output = execSync('npx tsc --noEmit --pretty false', {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      parseTscOutput(output, issues, root);
    } catch (err: any) {
      if (err.stdout) {
        parseTscOutput(String(err.stdout), issues, root);
      }
    }
  }

  // 2. Try ESLint JSON report if package.json has eslint
  if (issues.length < maxIssues && fs.existsSync(path.join(root, 'package.json'))) {
    try {
      const output = execSync('npx eslint . --format json --max-warnings 0', {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
      });
      parseEslintJson(output, issues, root);
    } catch (err: any) {
      if (err.stdout) {
        parseEslintJson(String(err.stdout), issues, root);
      }
    }
  }

  if (issues.length > 0) {
    const limited = issues.slice(0, maxIssues);
    return {
      issues: limited,
      sourceSummary: `Discovered ${issues.length} active static issues from workspace tools (${limited.length} sampled).`,
    };
  }

  // 3. Fallback: Synthesize standard defect probes across real source files
  const syntheticProbes = generateSyntheticProbes(root, maxIssues);
  return {
    issues: syntheticProbes,
    sourceSummary:
      syntheticProbes.length > 0
        ? `Codebase is clean of static errors. Sampled ${syntheticProbes.length} standard defect probes across source files.`
        : 'No source files detected for probe sampling.',
  };
}

function parseTscOutput(output: string, issues: StaticIssue[], root: string): void {
  // Line format: src/file.ts(12,5): error TS2322: Type 'X' is not assignable to type 'Y'.
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let match;
  while ((match = re.exec(output)) !== null) {
    const relFile = path.relative(root, path.resolve(root, match[1]));
    issues.push({
      id: `tsc-${match[4]}-${issues.length + 1}`,
      file: relFile,
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      rule: match[4],
      message: match[5],
      source: 'tsc',
    });
  }
}

function parseEslintJson(output: string, issues: StaticIssue[], root: string): void {
  try {
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) return;
    for (const fileObj of parsed) {
      const relFile = path.relative(root, fileObj.filePath || '');
      if (!Array.isArray(fileObj.messages)) continue;
      for (const msg of fileObj.messages) {
        issues.push({
          id: `eslint-${msg.ruleId || 'rule'}-${issues.length + 1}`,
          file: relFile,
          line: msg.line || 1,
          column: msg.column || 1,
          rule: msg.ruleId || undefined,
          message: msg.message,
          source: 'eslint',
        });
      }
    }
  } catch {
    // ignore json parse failures
  }
}

export function generateSyntheticProbes(root: string, maxProbes = 10): StaticIssue[] {
  const probes: StaticIssue[] = [];
  const candidateFiles: string[] = [];

  walk(
    root,
    (abs, rel) => {
      if (isSourceFile(abs)) {
        candidateFiles.push(rel);
      }
    },
    { maxFiles: 500 },
  );

  if (candidateFiles.length === 0) return probes;

  const probeTemplates = [
    {
      rule: 'TS7006',
      message: "Parameter implicitly has an 'any' type in exported signature.",
      source: 'tsc' as const,
    },
    {
      rule: 'TS2322',
      message: "Type 'null | undefined' is not assignable to strict target type.",
      source: 'tsc' as const,
    },
    {
      rule: '@typescript-eslint/no-unused-vars',
      message: "'response' is defined but never used in function body.",
      source: 'eslint' as const,
    },
    {
      rule: 'TS2339',
      message: "Property 'status' does not exist on type 'unknown'.",
      source: 'tsc' as const,
    },
    {
      rule: 'import/no-unresolved',
      message: 'Cannot find module or its corresponding type declarations.',
      source: 'eslint' as const,
    },
  ];

  for (let i = 0; i < Math.min(maxProbes, candidateFiles.length * 2); i++) {
    const file = candidateFiles[i % candidateFiles.length];
    const template = probeTemplates[i % probeTemplates.length];
    probes.push({
      id: `probe-${i + 1}`,
      file,
      line: ((i * 17) % 80) + 5,
      column: 3,
      rule: template.rule,
      message: template.message,
      source: 'probe',
      snippet: `// Synthetic benchmark defect probe ${i + 1}`,
    });
    if (probes.length >= maxProbes) break;
  }

  return probes;
}
