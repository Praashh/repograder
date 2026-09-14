import assert from 'assert';
import path from 'path';
import { runAll } from '../src/score';
import {
  renderJSON,
  renderText,
  renderMarkdown,
  renderBadge,
  renderSARIF,
  renderCodeClimate,
} from '../src/report';

const repoRoot = path.resolve(__dirname, '../..');
const result = runAll(repoRoot);

assert.strictEqual(result.results.length, 7, 'expected 7 dimension scanners to run');
assert.ok(result.ceiling >= 1 && result.ceiling <= 5, 'ceiling should be in range 1-5');
assert.ok(result.indexScore >= 0 && result.indexScore <= 100, 'indexScore should be 0-100');
assert.ok(result.grade.length > 0, 'grade should not be empty');

result.results.forEach((r) => {
  assert.ok(r.score >= 1 && r.score <= 5, `${r.id} score out of range: ${r.score}`);
  assert.ok(Array.isArray(r.evidence) && r.evidence.length > 0, `${r.id} should produce evidence`);
  if (r.remediationTips) {
    assert.ok(Array.isArray(r.remediationTips), `${r.id} remediationTips should be an array`);
  }
});

// Test report formatters
const textOutput = renderText(result, repoRoot);
assert.ok(textOutput.includes('Agent Readiness Scan'), 'text report includes header');
assert.ok(textOutput.includes('Index:'), 'text report includes index score');

const jsonOutput = JSON.parse(renderJSON(result, repoRoot));
assert.strictEqual(jsonOutput.ceilingScore, result.ceiling, 'JSON ceilingScore matches');
assert.strictEqual(jsonOutput.indexScore, result.indexScore, 'JSON indexScore matches');

const mdOutput = renderMarkdown(result, repoRoot);
assert.ok(mdOutput.includes('# 🤖 Agent Readiness Report'), 'markdown includes title');
assert.ok(mdOutput.includes('### Score Breakdown'), 'markdown includes breakdown table');

const badgeOutput = JSON.parse(renderBadge(result));
assert.strictEqual(badgeOutput.schemaVersion, 1, 'badge has schemaVersion 1');
assert.ok(badgeOutput.message.includes(result.level.name), 'badge contains level name');

const sarifOutput = JSON.parse(renderSARIF(result, repoRoot));
assert.strictEqual(sarifOutput.version, '2.1.0', 'SARIF version is 2.1.0');
assert.ok(Array.isArray(sarifOutput.runs), 'SARIF runs is array');
assert.strictEqual(sarifOutput.runs[0].tool.driver.name, 'repograder');

const codeClimateOutput = JSON.parse(renderCodeClimate(result, repoRoot));
assert.ok(Array.isArray(codeClimateOutput), 'Code Climate output is an array of issues');

console.log(
  'smoke test passed:',
  JSON.stringify({
    ceiling: result.ceiling,
    level: result.level.name,
    indexScore: result.indexScore,
    grade: result.grade,
  }),
);
