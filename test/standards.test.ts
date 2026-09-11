import assert from 'assert';
import path from 'path';
import { scan } from '../src/scanners/standards';

const repoRoot = path.resolve(__dirname, '../..');
const result = scan(repoRoot);

assert.ok(result.score >= 1 && result.score <= 5, 'standards score is in valid range');
assert.ok(result.evidence.length > 0, 'standards evidence is present');
assert.strictEqual(result.blocking, false, 'standards scanner is non-blocking');

// In repograder repo, eslint.config.mjs, .prettierrc, and CI lint are present
assert.ok(result.score >= 4, `expected standards score >= 4, got ${result.score}`);

console.log('standards scanner tests passed.');
