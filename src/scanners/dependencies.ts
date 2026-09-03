import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';

interface EcosystemDef {
  name: string;
  manifest: string[];
  lock: string[];
}

interface DetectedEco {
  name: string;
  hasManifest: boolean;
  hasLock: boolean;
  lockFile: string | null;
  lockIgnored: boolean;
}

// [manifestFiles], [lockFiles] pairs per ecosystem
const ECOSYSTEMS: EcosystemDef[] = [
  { name: 'Node', manifest: ['package.json'], lock: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] },
  { name: 'Python', manifest: ['pyproject.toml', 'requirements.txt', 'Pipfile'], lock: ['poetry.lock', 'Pipfile.lock', 'uv.lock'] },
  { name: 'Rust', manifest: ['Cargo.toml'], lock: ['Cargo.lock'] },
  { name: 'Go', manifest: ['go.mod'], lock: ['go.sum'] },
  { name: 'Ruby', manifest: ['Gemfile'], lock: ['Gemfile.lock'] },
  { name: 'PHP', manifest: ['composer.json'], lock: ['composer.lock'] },
  { name: 'Java/Gradle', manifest: ['build.gradle', 'build.gradle.kts'], lock: ['gradle.lockfile'] },
];

const AUTOMATION_FILES = [
  '.github/dependabot.yml',
  '.github/dependabot.yaml',
  'renovate.json',
  '.renovaterc',
  '.renovaterc.json',
];

function exists(root: string, names: string[]): boolean {
  return names.some((n) => fs.existsSync(path.join(root, n)));
}

/** Returns the first matching filename from names[], or null. */
function findFirst(root: string, names: string[]): string | null {
  return names.find((n) => fs.existsSync(path.join(root, n))) ?? null;
}

/**
 * Returns true if `filename` (bare name, no path) appears in the root .gitignore.
 * Only catches the most common patterns — exact name or /name at root.
 */
function isGitignored(root: string, filename: string): boolean {
  const gitignorePath = path.join(root, '.gitignore');
  try {
    const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n');
    return lines.some((line: string) => {
      const t = line.trim();
      return t && !t.startsWith('#') && (t === filename || t === `/${filename}`);
    });
  } catch {
    return false;
  }
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const detected: DetectedEco[] = [];

  for (const eco of ECOSYSTEMS) {
    const hasManifest = exists(root, eco.manifest);
    if (!hasManifest) continue;
    const lockFile = findFirst(root, eco.lock);
    const hasLock = lockFile !== null;
    const lockIgnored = hasLock && isGitignored(root, lockFile!);
    detected.push({ name: eco.name, hasManifest, hasLock, lockFile, lockIgnored });
  }

  if (detected.length === 0) {
    evidence.push('No recognized dependency manifest found (may be a manifest-less project).');
    return { score: 3, evidence, blocking: false };
  }

  // A gitignored lockfile is as good as missing for reproducibility purposes
  const withLock = detected.filter((d) => d.hasLock && !d.lockIgnored).length;
  const hasAutomation = exists(root, AUTOMATION_FILES);

  detected.forEach((d) => {
    if (!d.hasLock) {
      evidence.push(`${d.name}: manifest present, lockfile MISSING.`);
    } else if (d.lockIgnored) {
      evidence.push(`${d.name}: lockfile present (${d.lockFile}) but it is listed in .gitignore — won't be available in CI or to agents cloning the repo.`);
    } else {
      evidence.push(`${d.name}: manifest present, lockfile present (${d.lockFile}).`);
    }
  });

  let score: number;
  if (withLock === 0) {
    score = 2;
  } else if (withLock === detected.length && hasAutomation) {
    score = 5;
    evidence.push('Automated dependency updates configured (Dependabot/Renovate).');
  } else if (withLock === detected.length) {
    score = 4;
  } else {
    score = 3;
  }

  return { score, evidence, blocking: false };
}

export const id = 'dependencies';
export const label = 'Dependency reproducibility';
export { scan };
