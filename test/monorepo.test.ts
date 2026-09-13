import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { detectWorkspaces } from '../src/lib/workspace';
import { scan as scanTypeSafety } from '../src/scanners/typeSafety';
import { scan as scanStandards } from '../src/scanners/standards';
import { scan as scanDependencies } from '../src/scanners/dependencies';
import { initAgentsMd } from '../src/init';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repograder-monorepo-test-'));

try {
  // Test 1: Workspace detection - pnpm monorepo
  const pnpmRepo = path.join(tempDir, 'pnpm-repo');
  fs.mkdirSync(pnpmRepo, { recursive: true });
  fs.writeFileSync(
    path.join(pnpmRepo, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
  );

  const webApp = path.join(pnpmRepo, 'apps', 'web');
  const uiPkg = path.join(pnpmRepo, 'packages', 'ui');
  fs.mkdirSync(webApp, { recursive: true });
  fs.mkdirSync(uiPkg, { recursive: true });
  fs.writeFileSync(
    path.join(webApp, 'package.json'),
    JSON.stringify({ name: '@app/web', version: '1.0.0' }),
  );
  fs.writeFileSync(
    path.join(uiPkg, 'package.json'),
    JSON.stringify({ name: '@app/ui', version: '1.0.0' }),
  );

  const pnpmInfo = detectWorkspaces(pnpmRepo);
  assert.strictEqual(pnpmInfo.isMonorepo, true, 'pnpm monorepo should be recognized');
  assert.strictEqual(pnpmInfo.type, 'pnpm', 'pnpm workspace type');
  assert.strictEqual(pnpmInfo.packages.length, 2, 'should find 2 packages');
  const pkgNames = pnpmInfo.packages.map((p) => p.name).sort();
  assert.deepStrictEqual(pkgNames, ['@app/ui', '@app/web']);

  // Test 2: Workspace detection - Turborepo / npm workspaces
  const turboRepo = path.join(tempDir, 'turbo-repo');
  fs.mkdirSync(turboRepo, { recursive: true });
  fs.writeFileSync(
    path.join(turboRepo, 'package.json'),
    JSON.stringify({ name: 'turbo-root', workspaces: ['packages/*'] }),
  );
  fs.writeFileSync(path.join(turboRepo, 'turbo.json'), JSON.stringify({}));
  const pkgA = path.join(turboRepo, 'packages', 'core');
  fs.mkdirSync(pkgA, { recursive: true });
  fs.writeFileSync(
    path.join(pkgA, 'package.json'),
    JSON.stringify({ name: '@turbo/core', version: '1.0.0' }),
  );

  const turboInfo = detectWorkspaces(turboRepo);
  assert.strictEqual(turboInfo.isMonorepo, true, 'turbo monorepo should be recognized');
  assert.strictEqual(turboInfo.type, 'turborepo', 'turborepo type identified');
  assert.strictEqual(turboInfo.packages.length, 1, '1 package found in turbo repo');

  // Test 3: Type safety in monorepo with subproject tsconfigs extending base
  fs.writeFileSync(
    path.join(pnpmRepo, 'tsconfig.base.json'),
    JSON.stringify({ compilerOptions: { strict: true } }),
  );
  fs.writeFileSync(
    path.join(webApp, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { jsx: 'react-jsx' },
    }),
  );
  fs.writeFileSync(
    path.join(uiPkg, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { declaration: true },
    }),
  );

  const tsStrictResult = scanTypeSafety(pnpmRepo);
  assert.strictEqual(
    tsStrictResult.score,
    4,
    'strict tsconfig across subprojects without CI should score 4',
  );
  assert.ok(
    tsStrictResult.evidence.some((e) =>
      e.includes('workspace package(s) with strict mode enabled'),
    ),
    'evidence notes strict mode across workspace packages',
  );

  // Test 4: Monorepo with CI type check command (turbo run typecheck)
  const ghWorkflows = path.join(pnpmRepo, '.github', 'workflows');
  fs.mkdirSync(ghWorkflows, { recursive: true });
  fs.writeFileSync(
    path.join(ghWorkflows, 'ci.yml'),
    'name: CI\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm -r typecheck\n      - run: turbo run lint\n',
  );

  const tsCiResult = scanTypeSafety(pnpmRepo);
  assert.strictEqual(
    tsCiResult.score,
    5,
    'strict tsconfig with pnpm -r typecheck in CI should score 5',
  );
  assert.ok(
    tsCiResult.evidence.some((e) => e.includes('verified in CI')),
    'evidence notes CI verification',
  );

  // Test 5: Type safety with loose subproject tsconfig (Weakest Link Principle)
  fs.writeFileSync(
    path.join(uiPkg, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: false },
    }),
  );
  const tsLooseResult = scanTypeSafety(pnpmRepo);
  assert.strictEqual(tsLooseResult.score, 3, 'loose tsconfig in subproject should degrade to 3');
  assert.ok(
    tsLooseResult.evidence.some((e) => e.includes('strict mode is disabled in:')),
    'evidence highlights subproject with disabled strict mode',
  );

  // Restore strict for uiPkg
  fs.writeFileSync(
    path.join(uiPkg, 'tsconfig.json'),
    JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { declaration: true },
    }),
  );

  // Test 6: Standards enforcement with linter and formatter inside subprojects
  // Root has no eslint config, subprojects have eslint and prettier
  fs.writeFileSync(path.join(webApp, 'eslint.config.mjs'), 'export default [];\n');
  fs.writeFileSync(path.join(uiPkg, '.eslintrc.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(pnpmRepo, '.prettierrc'), JSON.stringify({ singleQuote: true }));

  const standardsResult = scanStandards(pnpmRepo);
  assert.ok(
    standardsResult.score >= 4,
    `expected standards score >= 4 with subproject linters, got ${standardsResult.score}`,
  );
  assert.ok(
    standardsResult.evidence.some((e) => e.includes('workspace subprojects')),
    'evidence notes linter config in workspace subprojects',
  );

  // Test 7: Dependencies scanner in monorepo
  fs.writeFileSync(path.join(pnpmRepo, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n');
  const depResult = scanDependencies(pnpmRepo);
  assert.ok(depResult.score >= 4, `expected dep score >= 4, got ${depResult.score}`);
  assert.ok(
    depResult.evidence.some((e) => e.includes('Monorepo workspace (pnpm)')),
    'evidence notes monorepo workspace type',
  );

  // Test 8: Init command in monorepo
  const initRes = initAgentsMd(pnpmRepo);
  assert.strictEqual(initRes.success, true, 'init should succeed in monorepo');
  const agentsContent = fs.readFileSync(path.join(pnpmRepo, 'AGENTS.md'), 'utf8');
  assert.ok(
    agentsContent.includes('monorepo with 2 packages'),
    'scaffolded AGENTS.md includes monorepo info',
  );
  assert.ok(
    agentsContent.includes('pnpm -r build') || agentsContent.includes('npm run build'),
    'scaffolded build command present',
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('monorepo tests passed.');
