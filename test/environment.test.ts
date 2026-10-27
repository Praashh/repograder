import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { scan } from '../src/scanners/environment';

const repoRoot = path.resolve(__dirname, '../..');
const result = scan(repoRoot);

assert.ok(result.score >= 1 && result.score <= 5, 'environment score is in valid range');
assert.ok(result.evidence.length > 0, 'environment evidence is present');
assert.strictEqual(result.blocking, false, 'environment scanner is non-blocking');

// repograder repo has package.json with engines.node specified and .devcontainer/devcontainer.json
assert.strictEqual(result.score, 5, `expected repograder environment score 5, got ${result.score}`);
assert.ok(
  result.evidence.some((e) => e.includes('engines.node')),
  'evidence mentions engines.node',
);
assert.ok(
  result.evidence.some((e) => e.includes('.devcontainer')),
  'evidence mentions .devcontainer',
);

// Test fixture: empty dir -> neutral 3
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-env-empty-'));
const emptyRes = scan(emptyDir);
assert.strictEqual(emptyRes.score, 3, 'empty directory should return neutral score 3');
fs.rmSync(emptyDir, { recursive: true, force: true });

// Test fixture: pinned runtime only (no container) -> 4/5
const pinnedOnlyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-env-pinned-'));
fs.writeFileSync(
  path.join(pinnedOnlyDir, 'package.json'),
  JSON.stringify({ name: 'test-app', engines: { node: '>=18' } }),
);
const pinnedRes = scan(pinnedOnlyDir);
assert.strictEqual(pinnedRes.score, 4, `expected pinned only score 4, got ${pinnedRes.score}`);
fs.rmSync(pinnedOnlyDir, { recursive: true, force: true });

// Test fixture: pinned runtime + Dockerfile -> 5/5
const fullEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-env-full-'));
fs.writeFileSync(path.join(fullEnvDir, 'package.json'), JSON.stringify({ name: 'test-app' }));
fs.writeFileSync(path.join(fullEnvDir, '.nvmrc'), 'v20.10.0\n');
fs.writeFileSync(path.join(fullEnvDir, 'Dockerfile'), 'FROM node:20-alpine\n');

const fullRes = scan(fullEnvDir);
assert.strictEqual(fullRes.score, 5, `expected full env score 5, got ${fullRes.score}`);
assert.ok(fullRes.evidence.some((e) => e.includes('.nvmrc')));
assert.ok(fullRes.evidence.some((e) => e.includes('Dockerfile')));
fs.rmSync(fullEnvDir, { recursive: true, force: true });

console.log('environment scanner tests passed.');
