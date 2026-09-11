import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initAgentsMd } from '../src/init';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-init-test-'));

try {
  // Create a dummy package.json in tempDir
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'sample-project',
      scripts: {
        build: 'tsc',
        test: 'jest',
        lint: 'eslint .',
      },
    }),
  );

  const res1 = initAgentsMd(tempDir);
  assert.strictEqual(res1.success, true, 'init should succeed in fresh dir');

  const content = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf8');
  assert.ok(content.includes('# AGENTS.md'), 'has header');
  assert.ok(content.includes('sample-project'), 'contains detected project name');
  assert.ok(content.includes('npm run build'), 'contains build script');
  assert.ok(content.includes('npm test'), 'contains test script');

  // Should fail without --force when file already exists
  const res2 = initAgentsMd(tempDir, { force: false });
  assert.strictEqual(res2.success, false, 'init should fail without force if file exists');

  // Should succeed with force: true
  const res3 = initAgentsMd(tempDir, { force: true });
  assert.strictEqual(res3.success, true, 'init should succeed with force: true');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('init tests passed.');
