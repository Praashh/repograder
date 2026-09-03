import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';

const LINTER_FILES = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
  'ruff.toml', '.ruff.toml', '.flake8', 'pylintrc', '.pylintrc',
  '.rubocop.yml', '.golangci.yml', '.golangci.yaml',
  'checkstyle.xml', 'clippy.toml',
];

const FORMATTER_FILES = [
  '.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.yml', 'prettier.config.js',
  '.editorconfig', 'rustfmt.toml',
];

const PRECOMMIT_FILES = ['.pre-commit-config.yaml', '.pre-commit-config.yml'];

// Common secret-bearing files that should never be committed
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.development'];

function existsAll(root: string, names: string[]): string[] {
  return names.filter((n) => fs.existsSync(path.join(root, n)));
}

function hasHusky(root: string): boolean {
  return fs.existsSync(path.join(root, '.husky'));
}

function pyprojectHasLintConfig(root: string): boolean {
  const p = path.join(root, 'pyproject.toml');
  if (!fs.existsSync(p)) return false;
  try {
    const content = fs.readFileSync(p, 'utf8');
    return /\[tool\.(ruff|black|flake8|isort)\]/.test(content);
  } catch {
    return false;
  }
}

/**
 * Returns any .env-style files that exist on disk but are NOT covered by .gitignore.
 * A bare `.env` pattern in .gitignore covers all variants, so we check for that too.
 */
function unprotectedEnvFiles(root: string): string[] {
  let gitignoreLines: string[] = [];
  try {
    gitignoreLines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch { /* no .gitignore is itself a problem, handled below */ }

  const wildcardCoversAll = gitignoreLines.some((l: string) => l === '.env' || l === '*.env' || l === '.env*');

  return ENV_FILES.filter((f) => {
    if (!fs.existsSync(path.join(root, f))) return false;
    if (wildcardCoversAll) return false;
    return !gitignoreLines.some((l: string) => l === f || l === `/${f}`);
  });
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const linters = existsAll(root, LINTER_FILES);
  const formatters = existsAll(root, FORMATTER_FILES);
  const precommitFiles = existsAll(root, PRECOMMIT_FILES);
  const huskyPresent = hasHusky(root);
  const pyprojectLint = pyprojectHasLintConfig(root);

  const hasLinter = linters.length > 0 || pyprojectLint;
  const hasFormatter = formatters.length > 0 || pyprojectLint;
  const hasEnforcement = precommitFiles.length > 0 || huskyPresent;

  if (linters.length) evidence.push(`Linter config: ${linters.join(', ')}.`);
  if (formatters.length) evidence.push(`Formatter config: ${formatters.join(', ')}.`);
  if (pyprojectLint) evidence.push('pyproject.toml declares lint/format tool config.');
  if (precommitFiles.length) evidence.push(`Pre-commit hooks configured: ${precommitFiles.join(', ')}.`);
  if (huskyPresent) evidence.push('Husky git hooks present.');

  // Secret hygiene check
  const exposedEnvFiles = unprotectedEnvFiles(root);
  if (exposedEnvFiles.length > 0) {
    evidence.push(`⚠️  Secret hygiene: ${exposedEnvFiles.join(', ')} present on disk but not covered by .gitignore — may expose secrets in CI or agent runs.`);
  }

  let score: number;
  if (!hasLinter && !hasFormatter) {
    score = 1;
    evidence.push('No linter or formatter configuration found.');
  } else if (hasLinter && !hasFormatter) {
    score = 3;
  } else if (hasLinter && hasFormatter && !hasEnforcement) {
    score = 4;
  } else if (hasLinter && hasFormatter && hasEnforcement) {
    score = 5;
  } else {
    score = 2;
  }

  return { score, evidence, blocking: false };
}

export const id = 'standards';
export const label = 'Standards enforcement tooling';
export { scan };
