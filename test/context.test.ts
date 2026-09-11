import assert from 'assert';
import path from 'path';
import { scan } from '../src/scanners/context';

const repoRoot = path.resolve(__dirname, '../..');
const result = scan(repoRoot);

assert.ok(result.score >= 1 && result.score <= 5, 'context score is in valid range');
assert.ok(result.evidence.length > 0, 'context evidence is present');
assert.strictEqual(result.blocking, false, 'context scanner is non-blocking');

// In repograder repo, AGENTS.md exists and is substantive
assert.ok(result.score >= 4, `expected context score >= 4, got ${result.score}`);

console.log('context scanner tests passed.');
