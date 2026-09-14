import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { runFix } from '../src/fix';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-fix-test-'));

try {
  // Create mock project files
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({ name: 'mock-proj', scripts: {} }),
  );
  fs.writeFileSync(
    path.join(tempDir, '.env'),
    'SECRET_KEY=supersecret123\nDATABASE_URL=postgres://user:pass@localhost:5432/db\n',
  );

  // 1. Dry run test
  const dryRunRes = runFix(tempDir, { dryRun: true });
  assert.ok(dryRunRes.actions.length >= 2, 'dry run should identify needed actions');
  assert.ok(dryRunRes.summary.includes('Dry run:'), 'summary indicates dry run');
  assert.strictEqual(
    fs.existsSync(path.join(tempDir, '.gitignore')),
    false,
    '.gitignore should not be written on dry run',
  );
  assert.strictEqual(
    fs.existsSync(path.join(tempDir, '.env.example')),
    false,
    '.env.example should not be written on dry run',
  );

  // 2. Real run test
  const realRes = runFix(tempDir, { dryRun: false });
  assert.ok(
    realRes.actions.some((a) => a.applied),
    'actions should be applied',
  );

  // Verify .gitignore was created
  const gitignorePath = path.join(tempDir, '.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore was created');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert.ok(gitignoreContent.includes('node_modules/'), '.gitignore has node_modules');
  assert.ok(gitignoreContent.includes('.env'), '.gitignore has .env');

  // Verify .env.example was created and secrets were not leaked
  const envExamplePath = path.join(tempDir, '.env.example');
  assert.ok(fs.existsSync(envExamplePath), '.env.example was created');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  assert.ok(
    envExampleContent.includes('SECRET_KEY=your_secret_key_here'),
    'has placeholder for SECRET_KEY',
  );
  assert.ok(
    envExampleContent.includes('DATABASE_URL=your_database_url_here'),
    'has placeholder for DATABASE_URL',
  );
  assert.ok(
    !envExampleContent.includes('supersecret123'),
    'secret was NOT leaked into .env.example',
  );

  // Verify AGENTS.md was created
  const agentsMdPath = path.join(tempDir, 'AGENTS.md');
  assert.ok(fs.existsSync(agentsMdPath), 'AGENTS.md was created');

  // Verify test stub was created (since package.json has no test script and no test files)
  const testStubPath = path.join(tempDir, 'test/smoke.test.js');
  assert.ok(fs.existsSync(testStubPath), 'test/smoke.test.js stub was created');

  // 3. Re-run fix (idempotency check)
  const rerunRes = runFix(tempDir, { dryRun: false });
  const newlyApplied = rerunRes.actions.filter((a) => a.applied);
  assert.strictEqual(newlyApplied.length, 0, 'subsequent run should apply 0 actions');

  console.log('fix tests passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
