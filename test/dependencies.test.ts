import assert from 'assert';
import path from 'path';
import { scan } from '../src/scanners/dependencies';

const repoRoot = path.resolve(__dirname, '../..');
const result = scan(repoRoot);

assert.ok(result.score >= 1 && result.score <= 5, 'dependencies score is in valid range');
assert.ok(result.evidence.length > 0, 'dependencies evidence is present');
assert.strictEqual(result.blocking, false, 'dependencies scanner is non-blocking');

// In repograder repo, package.json, package-lock.json, and dependabot are present
assert.strictEqual(result.score, 5, `expected dependencies score 5, got ${result.score}`);

console.log('dependencies scanner tests passed.');
