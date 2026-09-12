import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { scan } from '../src/scanners/typeSafety';

const repoRoot = path.resolve(__dirname, '../..');
const result = scan(repoRoot);

assert.ok(result.score >= 1 && result.score <= 5, 'typeSafety score is in valid range');
assert.ok(result.evidence.length > 0, 'typeSafety evidence is present');
assert.strictEqual(result.blocking, false, 'typeSafety scanner is non-blocking');

// In repograder repo, strict tsconfig.json is present and CI verifies build
assert.strictEqual(result.score, 5, `expected repograder typeSafety score 5, got ${result.score}`);
assert.ok(
  result.evidence.some((e) => e.includes('strict mode enabled')),
  'evidence notes strict mode enabled',
);

// Test fixtures with temporary directories
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-typesafety-test-'));

try {
  // Scenario 1: Non-strict TypeScript
  const tsLooseDir = path.join(tempDir, 'ts-loose');
  fs.mkdirSync(tsLooseDir);
  fs.writeFileSync(
    path.join(tsLooseDir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: false } }),
  );
  const tsLooseResult = scan(tsLooseDir);
  assert.strictEqual(tsLooseResult.score, 3, 'loose tsconfig should score 3');
  assert.ok(
    tsLooseResult.evidence.some((e) => e.includes('strict mode is disabled')),
    'evidence notes disabled strict mode',
  );

  // Scenario 2: JS project with package.json and no tsconfig
  const jsOnlyDir = path.join(tempDir, 'js-only');
  fs.mkdirSync(jsOnlyDir);
  fs.writeFileSync(
    path.join(jsOnlyDir, 'package.json'),
    JSON.stringify({ name: 'pure-js', scripts: {} }),
  );
  const jsResult = scan(jsOnlyDir);
  assert.strictEqual(jsResult.score, 2, 'pure JS project should score 2');
  assert.ok(
    jsResult.remediationTips?.some((t) => t.includes('tsconfig.json') || t.includes('tsc --init')),
    'remediation tip suggests configuring tsconfig',
  );

  // Scenario 3: Python project with strict mypy
  const pyDir = path.join(tempDir, 'py-mypy');
  fs.mkdirSync(pyDir);
  fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[tool.mypy]\nstrict = true\n');
  const pyResult = scan(pyDir);
  assert.strictEqual(pyResult.score, 4, 'strict mypy without CI should score 4');
  assert.ok(
    pyResult.evidence.some((e) => e.includes('strict rules')),
    'evidence notes strict python rules',
  );

  // Scenario 4: Manifest-less directory
  const emptyDir = path.join(tempDir, 'empty');
  fs.mkdirSync(emptyDir);
  const emptyResult = scan(emptyDir);
  assert.strictEqual(emptyResult.score, 3, 'manifest-less directory defaults to 3');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('typeSafety scanner tests passed.');
