import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  checkRules,
  syncRules,
  computeContentHash,
  renderRulesCheckTerminal,
  renderRulesSyncTerminal,
} from '../src/rules';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-rules-test-'));
}

function cleanTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// 1. Check rules on empty directory
{
  const tempDir = createTempDir();
  try {
    const res = checkRules(tempDir);
    assert.strictEqual(res.primaryFile, null, 'No primary file found in empty dir');
    assert.strictEqual(res.inSync, false, 'Empty dir should not be in sync');
    assert.strictEqual(res.missingTargets.length, 5, 'All 5 targets should be missing');
    assert.ok(res.summary.includes('No canonical agent instructions found'));
  } finally {
    cleanTempDir(tempDir);
  }
}

// 2. Hash computation consistency
{
  const contentA = '# AGENTS.md\n\nBuild: npm test\n';
  const contentB =
    '# AGENTS.md\n\nBuild: npm test\n<!-- repograder:synced-from=AGENTS.md:sha=123456789012 -->\n';
  assert.strictEqual(
    computeContentHash(contentA),
    computeContentHash(contentB),
    'computeContentHash should strip sync comments before hashing',
  );
}

// 3. Dry-run sync preview
{
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# AGENTS.md\n\nInstructions\n', 'utf8');
    const syncRes = syncRules(tempDir, { dryRun: true });
    assert.ok(syncRes.summary.includes('Dry-run preview'), 'Summary indicates dry run');
    const cursorFile = path.join(tempDir, '.cursor', 'rules', 'agent-instructions.mdc');
    assert.strictEqual(fs.existsSync(cursorFile), false, 'Dry-run must not create files');
  } finally {
    cleanTempDir(tempDir);
  }
}

// 4. Live sync and drift detection cycle
{
  const tempDir = createTempDir();
  try {
    // Scaffold initial AGENTS.md
    const initialContent =
      '# AGENTS.md\n\n## Build & Test\n- Build: npm run build\n- Test: npm test\n';
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), initialContent, 'utf8');

    // Run sync
    const syncRes = syncRules(tempDir);
    assert.strictEqual(syncRes.actions.length, 5, 'Should process all 5 targets');

    const cursorPath = path.join(tempDir, '.cursor', 'rules', 'agent-instructions.mdc');
    const claudePath = path.join(tempDir, '.claude', 'CLAUDE.md');
    const copilotPath = path.join(tempDir, '.github', 'copilot-instructions.md');
    const windsurfPath = path.join(tempDir, '.windsurfrules');

    assert.ok(fs.existsSync(cursorPath), 'Cursor MDC rule was created');
    assert.ok(fs.existsSync(claudePath), 'Claude CLAUDE.md was created');
    assert.ok(fs.existsSync(copilotPath), 'Copilot instructions was created');
    assert.ok(fs.existsSync(windsurfPath), 'Windsurf rules was created');

    // Verify Cursor MDC frontmatter
    const cursorContent = fs.readFileSync(cursorPath, 'utf8');
    assert.ok(cursorContent.includes('---'), 'Cursor rule has frontmatter');
    assert.ok(cursorContent.includes('globs: *'), 'Cursor rule has globs');
    assert.ok(cursorContent.includes('alwaysApply: true'), 'Cursor rule has alwaysApply');
    assert.ok(
      cursorContent.includes('repograder:synced-from=AGENTS.md:sha='),
      'Cursor rule has sync tag',
    );

    // Check rules: should be in sync
    const check1 = checkRules(tempDir);
    assert.strictEqual(check1.inSync, true, 'All targets should now be in sync');
    assert.strictEqual(check1.missingTargets.length, 0, 'No missing targets');
    assert.strictEqual(check1.outOfSyncTargets.length, 0, 'No out-of-sync targets');

    // Modify AGENTS.md to simulate drift
    fs.writeFileSync(
      path.join(tempDir, 'AGENTS.md'),
      initialContent + '\n## Conventions\n- Strict TypeScript\n',
      'utf8',
    );

    // Check rules: should detect drift
    const check2 = checkRules(tempDir);
    assert.strictEqual(check2.inSync, false, 'Rules should be detected as out of sync');
    assert.ok(check2.outOfSyncTargets.length > 0, 'Should list out-of-sync targets');

    // Resync: should update existing files
    const sync2 = syncRules(tempDir);
    const updatedCount = sync2.actions.filter((a) => a.action === 'updated').length;
    assert.ok(updatedCount >= 4, 'Should update drifted targets');

    // Recheck: in sync again
    const check3 = checkRules(tempDir);
    assert.strictEqual(check3.inSync, true, 'Rules should be in sync again after resync');
  } finally {
    cleanTempDir(tempDir);
  }
}

// 5. Target filtering
{
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# AGENTS.md\n', 'utf8');
    const syncRes = syncRules(tempDir, { targets: ['claude'] });
    assert.strictEqual(syncRes.actions.length, 1, 'Only claude target processed');
    assert.strictEqual(syncRes.actions[0].targetId, 'claude');
    assert.ok(fs.existsSync(path.join(tempDir, '.claude', 'CLAUDE.md')));
    assert.strictEqual(fs.existsSync(path.join(tempDir, '.windsurfrules')), false);
  } finally {
    cleanTempDir(tempDir);
  }
}

// 6. Terminal renderers test
{
  const tempDir = createTempDir();
  try {
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# AGENTS.md\n', 'utf8');
    const checkRes = checkRules(tempDir);
    const terminalCheck = renderRulesCheckTerminal(checkRes);
    assert.ok(
      terminalCheck.includes('MULTI-AGENT RULES HARMONY'),
      'Check terminal output renders header',
    );

    const syncRes = syncRules(tempDir, { dryRun: true });
    const terminalSync = renderRulesSyncTerminal(syncRes, true);
    assert.ok(terminalSync.includes('RULES SYNC (DRY-RUN)'), 'Sync terminal output renders header');
  } finally {
    cleanTempDir(tempDir);
  }
}

console.log('multi-agent rules tests passed.');
