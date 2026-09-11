import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';

const LINTER_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'ruff.toml',
  '.ruff.toml',
  '.flake8',
  'pylintrc',
  '.pylintrc',
  '.rubocop.yml',
  '.golangci.yml',
  '.golangci.yaml',
  'checkstyle.xml',
  'clippy.toml',
  'biome.json',
  'biome.jsonc',
  'oxlint.json',
  '.oxlintrc.json',
];

const FORMATTER_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
  '.editorconfig',
  'rustfmt.toml',
  'biome.json',
  'biome.jsonc',
];

const PRECOMMIT_FILES = ['.pre-commit-config.yaml', '.pre-commit-config.yml'];

// Common secret-bearing files that should never be committed
const ENV_FILES = ['.env', '.env.local', '.env.production', '.env.development'];

const CI_CANDIDATES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  '.travis.yml',
  'bitbucket-pipelines.yml',
];

const CI_LINT_CMD_RE =
  /\b(npm\s+(run\s+)?lint|pnpm\s+(run\s+)?lint|yarn\s+(run\s+)?lint|eslint|ruff|flake8|biome|golangci-lint|rubocop|cargo\s+clippy)\b/i;

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
    return /\[tool\.(ruff|black|flake8|isort|pylint)\]/.test(content);
  } catch {
    return false;
  }
}

function ciEnforcesLint(root: string): boolean {
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
          if (CI_LINT_CMD_RE.test(fs.readFileSync(file, 'utf8'))) return true;
        } catch {
          // ignore read error
        }
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Returns any .env-style files that exist on disk but are NOT covered by .gitignore.
 * A bare `.env` pattern in .gitignore covers all variants, so we check for that too.
 */
function unprotectedEnvFiles(root: string): string[] {
  let gitignoreLines: string[] = [];
  try {
    gitignoreLines = fs
      .readFileSync(path.join(root, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    // no .gitignore is itself a problem
  }

  const wildcardCoversAll = gitignoreLines.some(
    (l: string) => l === '.env' || l === '*.env' || l === '.env*',
  );

  return ENV_FILES.filter((f) => {
    if (!fs.existsSync(path.join(root, f))) return false;
    if (wildcardCoversAll) return false;
    return !gitignoreLines.some((l: string) => l === f || l === `/${f}`);
  });
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const remediationTips: string[] = [];
  const linters = existsAll(root, LINTER_FILES);
  const formatters = existsAll(root, FORMATTER_FILES);
  const precommitFiles = existsAll(root, PRECOMMIT_FILES);
  const huskyPresent = hasHusky(root);
  const pyprojectLint = pyprojectHasLintConfig(root);
  const ciLint = ciEnforcesLint(root);

  const hasLinter = linters.length > 0 || pyprojectLint;
  const hasFormatter = formatters.length > 0 || pyprojectLint;
  const hasEnforcement = precommitFiles.length > 0 || huskyPresent || ciLint;

  if (linters.length) evidence.push(`Linter config: ${linters.join(', ')}.`);
  if (formatters.length) evidence.push(`Formatter config: ${formatters.join(', ')}.`);
  if (pyprojectLint) evidence.push('pyproject.toml declares lint/format tool config.');
  if (precommitFiles.length)
    evidence.push(`Pre-commit hooks configured: ${precommitFiles.join(', ')}.`);
  if (huskyPresent) evidence.push('Husky git hooks present.');
  if (ciLint) evidence.push('CI workflow includes lint validation step.');

  // Secret hygiene check
  const exposedEnvFiles = unprotectedEnvFiles(root);
  if (exposedEnvFiles.length > 0) {
    evidence.push(
      `⚠️  Secret hygiene: ${exposedEnvFiles.join(', ')} present on disk but not covered by .gitignore.`,
    );
    remediationTips.push(
      `Add ${exposedEnvFiles.join(', ')} to .gitignore to prevent accidental credential leakage.`,
    );
  }

  // Check if .env exists but .env.example is missing
  const hasEnv = ENV_FILES.some((f) => fs.existsSync(path.join(root, f)));
  const hasEnvExample =
    fs.existsSync(path.join(root, '.env.example')) ||
    fs.existsSync(path.join(root, '.env.template'));
  if (hasEnv && !hasEnvExample) {
    evidence.push('Found .env file without a corresponding .env.example template.');
    remediationTips.push(
      'Add a .env.example template so agents know required environment variables.',
    );
  }

  let score: number;
  if (!hasLinter && !hasFormatter) {
    score = 1;
    evidence.push('No linter or formatter configuration found.');
    remediationTips.push(
      'Configure a linter/formatter (e.g. npm init @eslint/config or npx @biomejs/biome init).',
    );
  } else if (hasLinter && !hasFormatter) {
    score = 3;
    evidence.push('Linter configured, but no formatter found.');
    remediationTips.push(
      'Add a formatter like Prettier (.prettierrc) or Biome to enforce style consistency.',
    );
  } else if (hasLinter && hasFormatter && !hasEnforcement) {
    score = 4;
    evidence.push(
      'Linter and formatter configured, but no pre-commit hook or CI check enforces them.',
    );
    remediationTips.push('Add a lint step to your CI workflow or set up pre-commit / Husky hooks.');
  } else if (hasLinter && hasFormatter && hasEnforcement) {
    score = 5;
  } else {
    score = 2;
    remediationTips.push('Add standard linting and formatting configuration files.');
  }

  return { score, evidence, remediationTips, blocking: false };
}

export const id = 'standards';
export const label = 'Standards enforcement tooling';
export { scan };
