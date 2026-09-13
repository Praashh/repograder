import fs from 'fs';
import path from 'path';
import { walk } from '../lib/walk';
import type { ScanResult } from '../types';
import { detectWorkspaces } from '../lib/workspace';

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec)(\/|$)|(\.|_)(test|spec)\.[a-z0-9]+$/i;

// Matches actual test runner invocations inside CI YAML files
const TEST_CMD_RE =
  /\b(npm\s+(run\s+)?test|yarn\s+(run\s+|workspaces\s+run\s+)?test|pnpm\s+(-r\s+|--filter\s+\S+\s+)?(run\s+)?test|turbo(\s+run)?\s+test|nx\s+(run-many\s+-t|run)\s+test|lerna\s+run\s+test|jest|vitest|mocha|pytest|go\s+test|cargo\s+test|rspec|phpunit|mvn\s+test|gradle\s+test|bun\s+test)\b/i;

const CI_CANDIDATES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  '.travis.yml',
  'bitbucket-pipelines.yml',
];

function hasCI(root: string): string | null {
  for (const candidate of CI_CANDIDATES) {
    const p = path.join(root, candidate);
    if (fs.existsSync(p)) {
      if (candidate.endsWith('workflows')) {
        try {
          const files = fs.readdirSync(p);
          if (files.length > 0) return candidate + ` (${files.length} workflow file(s))`;
        } catch {
          continue;
        }
      } else {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Returns true if any CI config file contains an actual test runner invocation.
 * Uses simple regex — no YAML parser needed.
 */
function ciHasTestCommands(root: string): boolean {
  for (const candidate of CI_CANDIDATES) {
    const p = path.join(root, candidate);
    if (!fs.existsSync(p)) continue;
    try {
      const files = candidate.endsWith('workflows')
        ? fs
            .readdirSync(p)
            .filter((f: string) => f.endsWith('.yml') || f.endsWith('.yaml'))
            .map((f: string) => path.join(p, f))
        : [p];
      for (const file of files) {
        try {
          if (TEST_CMD_RE.test(fs.readFileSync(file, 'utf8'))) return true;
        } catch {
          /* skip unreadable files */
        }
      }
    } catch {
      /* skip unreadable dirs */
    }
  }
  return false;
}

function checkPackageJsonTest(root: string): { hasTestScript: boolean; isStub: boolean } {
  const workspace = detectWorkspaces(root);
  const targets = [root, ...workspace.packages.map((p) => p.path)];

  let foundTest = false;
  let allStubs = true;

  for (const dir of targets) {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.scripts || !pkg.scripts.test) continue;
      const script = pkg.scripts.test.toLowerCase();
      const isStub =
        script.includes('no test specified') || script.includes('exit 1') || script.trim() === '';
      foundTest = true;
      if (!isStub) {
        allStubs = false;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!foundTest) return { hasTestScript: false, isStub: false };
  return { hasTestScript: true, isStub: allStubs };
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const remediationTips: string[] = [];
  let testFileCount = 0;

  walk(root, (_abs, rel) => {
    if (TEST_PATH_RE.test(rel)) testFileCount++;
  });

  const ciHit = hasCI(root);
  const ciRunsTests = ciHit ? ciHasTestCommands(root) : false;
  const pkgTest = checkPackageJsonTest(root);

  if (pkgTest.hasTestScript && pkgTest.isStub) {
    evidence.push('package.json has a dummy test script stub (e.g. "no test specified").');
    remediationTips.push('Update package.json "test" script with a real test runner command.');
  }

  let score: number;
  if (testFileCount === 0 && !ciHit) {
    score = 1;
    evidence.push('No test files or CI configuration detected.');
    remediationTips.push(
      'Add unit tests (e.g. using Vitest, Jest, or Pytest) and a CI workflow (.github/workflows/ci.yml).',
    );
  } else if (testFileCount === 0 && ciHit) {
    if (ciRunsTests) {
      score = 3;
      evidence.push(
        `CI configured (${ciHit}) — no test files in repo, but CI workflow invokes a test runner.`,
      );
      remediationTips.push('Add local test files matching the test runner invoked in CI.');
    } else {
      score = 2;
      evidence.push(
        `CI configured (${ciHit}) but no test files detected and no test runner invocation found in workflow.`,
      );
      remediationTips.push('Add a test step to your CI workflow and add test files.');
    }
  } else if (testFileCount > 0 && !ciHit) {
    score = 3;
    evidence.push(
      `${testFileCount} test file(s) found, but no CI configuration detected — signal isn't automatic.`,
    );
    remediationTips.push(
      'Configure GitHub Actions or GitLab CI to automatically run tests on pull requests.',
    );
  } else {
    // Both test files and CI present
    if (testFileCount >= 5 && ciRunsTests) {
      score = 5;
      evidence.push(
        `${testFileCount} test file(s) found, wired to CI (${ciHit}), test runner confirmed in workflow.`,
      );
    } else if (testFileCount >= 5) {
      score = 4;
      evidence.push(
        `${testFileCount} test file(s) found, wired to CI (${ciHit}) — no explicit test runner invocation detected in workflow.`,
      );
      remediationTips.push(
        'Ensure CI workflow explicitly invokes the test runner command (e.g. npm test, pytest).',
      );
    } else {
      score = 4;
      evidence.push(`${testFileCount} test file(s) found, wired to CI (${ciHit}).`);
      remediationTips.push(
        'Expand test suite to 5+ test files for complete regression protection across all modules.',
      );
    }
  }

  return { score, evidence, remediationTips, blocking: true };
}

export const id = 'tests';
export const label = 'Test signal & CI';
export { scan };
