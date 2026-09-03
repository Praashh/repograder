import assert from 'assert';
import path from 'path';
import { runAll } from '../src/score.js';

const result = runAll(path.join(__dirname, '..'));

assert.ok(result.results.length === 5, 'expected 5 dimension scanners to run');
assert.ok(result.ceiling >= 1 && result.ceiling <= 5, 'ceiling should be in range 1-5');
result.results.forEach((r) => {
  assert.ok(r.score >= 1 && r.score <= 5, `${r.id} score out of range: ${r.score}`);
  assert.ok(Array.isArray(r.evidence) && r.evidence.length > 0, `${r.id} should produce evidence`);
});

console.log('smoke test passed:', JSON.stringify({ ceiling: result.ceiling, level: result.level.name }));
