import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { compareResults } from '../src/diff';
import { installGitHook } from '../src/hook';
import { buildSlackPayload, buildDiscordPayload } from '../src/notify';
import type { RunAllResult } from '../src/types';

// 1. Test compareResults
const mockBase: RunAllResult = {
  results: [
    { id: 'tests', label: 'Test signal', score: 3, evidence: ['some tests'], blocking: false },
    { id: 'context', label: 'Agent context', score: 4, evidence: ['agents.md'], blocking: false },
  ],
  ceiling: 3,
  level: { min: 3, max: 3, name: 'Supervised' },
  indexScore: 70,
  grade: 'C',
  remediation: [],
};

const mockHeadImproved: RunAllResult = {
  results: [
    { id: 'tests', label: 'Test signal', score: 5, evidence: ['full tests'], blocking: false },
    { id: 'context', label: 'Agent context', score: 5, evidence: ['agents.md'], blocking: false },
  ],
  ceiling: 5,
  level: { min: 5, max: 5, name: 'Autonomous-ready' },
  indexScore: 100,
  grade: 'A+',
  remediation: [],
};

const improvedDiff = compareResults(mockBase, mockHeadImproved, 'TestRepo');
assert.strictEqual(improvedDiff.isRegression, false, 'not a regression');
assert.strictEqual(improvedDiff.ceilingDelta, 2, 'ceiling improved by 2');
assert.strictEqual(improvedDiff.indexDelta, 30, 'index improved by 30');
assert.ok(improvedDiff.markdown.includes('Readiness Improved'), 'markdown notes improvement');

const mockHeadRegressed: RunAllResult = {
  results: [
    { id: 'tests', label: 'Test signal', score: 2, evidence: ['broken tests'], blocking: false },
    { id: 'context', label: 'Agent context', score: 4, evidence: ['agents.md'], blocking: false },
  ],
  ceiling: 2,
  level: { min: 2, max: 2, name: 'Fragile' },
  indexScore: 60,
  grade: 'D',
  remediation: [],
};

const regressedDiff = compareResults(mockBase, mockHeadRegressed, 'TestRepo');
assert.strictEqual(regressedDiff.isRegression, true, 'is a regression');
assert.strictEqual(regressedDiff.ceilingDelta, -1, 'ceiling regressed by -1');
assert.ok(regressedDiff.markdown.includes('Regression Detected'), 'markdown notes regression');

// 2. Test installGitHook
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-hook-test-'));
try {
  // Without .git
  const failRes = installGitHook(tempDir);
  assert.strictEqual(failRes.success, false, 'fails without .git');

  // With .git
  fs.mkdirSync(path.join(tempDir, '.git'));
  const successRes = installGitHook(tempDir);
  assert.strictEqual(successRes.success, true, 'succeeds with .git');
  const hookPath = path.join(tempDir, '.git/hooks/pre-commit');
  assert.ok(fs.existsSync(hookPath), 'hook script written');
  const content = fs.readFileSync(hookPath, 'utf8');
  assert.ok(content.includes('repograder --fail-under 3'), 'contains repograder check');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// 3. Test Webhook Payloads
const slackPayload = buildSlackPayload(mockHeadImproved, 'my-org/my-repo');
assert.ok(typeof slackPayload.text === 'string' && slackPayload.text.includes('Autonomous-ready'));
assert.ok(Array.isArray(slackPayload.blocks));

const discordPayload = buildDiscordPayload(mockHeadImproved, 'my-org/my-repo') as any;
assert.ok(Array.isArray(discordPayload.embeds));
assert.strictEqual(discordPayload.embeds[0].color, 3066993);

console.log('integrations tests passed.');
