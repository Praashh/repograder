import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { loadConfig } from '../src/config';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-config-test-'));

try {
  // 1. Fallback empty
  const emptyConfig = loadConfig(tempDir);
  assert.deepStrictEqual(emptyConfig, {}, 'empty dir yields empty config');

  // 2. package.json field
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify({
      name: 'pkg-test',
      repograder: { failUnder: 4, format: 'markdown' },
    }),
  );
  const pkgConfig = loadConfig(tempDir);
  assert.strictEqual(pkgConfig.failUnder, 4, 'loaded failUnder from package.json');
  assert.strictEqual(pkgConfig.format, 'markdown', 'loaded format from package.json');

  // 3. repograder.config.json overrides package.json
  fs.writeFileSync(
    path.join(tempDir, 'repograder.config.json'),
    JSON.stringify({ failUnder: 5, format: 'json' }),
  );
  const fileConfig = loadConfig(tempDir);
  assert.strictEqual(fileConfig.failUnder, 5, 'loaded failUnder from repograder.config.json');
  assert.strictEqual(fileConfig.format, 'json', 'loaded format from repograder.config.json');

  // 4. Explicit config path
  const customConfigPath = path.join(tempDir, 'custom.json');
  fs.writeFileSync(customConfigPath, JSON.stringify({ failUnder: 3, format: 'sarif' }));
  const explicitConfig = loadConfig(tempDir, 'custom.json');
  assert.strictEqual(explicitConfig.failUnder, 3, 'loaded failUnder from custom explicit path');
  assert.strictEqual(explicitConfig.format, 'sarif', 'loaded format from custom explicit path');

  console.log('config tests passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
