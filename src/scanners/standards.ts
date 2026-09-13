import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';
import { detectWorkspaces } from '../lib/workspace';

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
  /\b(npm\s+(run\s+)?lint|pnpm\s+(-r\s+|--filter\s+\S+\s+)?(run\s+)?lint|yarn\s+(run\s+|workspaces\s+run\s+)?lint|turbo(\s+run)?\s+lint|nx\s+(run-many\s+-t|run)\s+lint|lerna\s+run\s+lint|bun\s+run\s+lint|eslint|ruff|flake8|biome|golangci-lint|rubocop|cargo\s+clippy)\b/i;

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

function packageJsonHasLintOrFormat(dir: string): { hasEslint: boolean; hasPrettier: boolean } {
  const p = path.join(dir, 'package.json');
  if (!fs.existsSync(p)) return { hasEslint: false, hasPrettier: false };
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      hasEslint: Boolean(pkg.eslintConfig),
      hasPrettier: Boolean(pkg.prettier),
    };
  } catch {
    return { hasEslint: false, hasPrettier: false };
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

  const workspace = detectWorkspaces(root);

  // Root checks
  const rootLinters = existsAll(root, LINTER_FILES);
  const rootFormatters = existsAll(root, FORMATTER_FILES);
  const precommitFiles = existsAll(root, PRECOMMIT_FILES);
  const huskyPresent = hasHusky(root);
  const rootPyprojectLint = pyprojectHasLintConfig(root);
  const rootPkgConfig = packageJsonHasLintOrFormat(root);
  const ciLint = ciEnforcesLint(root);

  // Subproject checks
  const subprojectLinterHits: { pkgName: string; relPath: string; file: string }[] = [];
  const subprojectFormatterHits: { pkgName: string; relPath: string; file: string }[] = [];
  let subprojectPyprojectLint = false;
  let subprojectEslintPkg = false;
  let subprojectPrettierPkg = false;

  for (const pkg of workspace.packages) {
    const pkgLinters = existsAll(pkg.path, LINTER_FILES);
    for (const f of pkgLinters) {
      subprojectLinterHits.push({
        pkgName: pkg.name,
        relPath: pkg.relPath,
        file: path.join(pkg.relPath, f),
      });
    }

    const pkgFormatters = existsAll(pkg.path, FORMATTER_FILES);
    for (const f of pkgFormatters) {
      subprojectFormatterHits.push({
        pkgName: pkg.name,
        relPath: pkg.relPath,
        file: path.join(pkg.relPath, f),
      });
    }

    if (pyprojectHasLintConfig(pkg.path)) subprojectPyprojectLint = true;
    const pkgChecks = packageJsonHasLintOrFormat(pkg.path);
    if (pkgChecks.hasEslint) subprojectEslintPkg = true;
    if (pkgChecks.hasPrettier) subprojectPrettierPkg = true;
  }

  const hasLinter =
    rootLinters.length > 0 ||
    rootPyprojectLint ||
    rootPkgConfig.hasEslint ||
    subprojectLinterHits.length > 0 ||
    subprojectPyprojectLint ||
    subprojectEslintPkg;

  const hasFormatter =
    rootFormatters.length > 0 ||
    rootPyprojectLint ||
    rootPkgConfig.hasPrettier ||
    subprojectFormatterHits.length > 0 ||
    subprojectPyprojectLint ||
    subprojectPrettierPkg;

  const hasEnforcement = precommitFiles.length > 0 || huskyPresent || ciLint;

  if (rootLinters.length) evidence.push(`Linter config: ${rootLinters.join(', ')}.`);
  if (subprojectLinterHits.length > 0) {
    if (subprojectLinterHits.length <= 4) {
      const details = subprojectLinterHits.map((h) => h.file).join(', ');
      evidence.push(`Linter config found in workspace subprojects: ${details}.`);
    } else {
      const distinctPkgs = new Set(subprojectLinterHits.map((h) => h.relPath)).size;
      evidence.push(
        `Linter configs detected across ${distinctPkgs} workspace package(s) (${subprojectLinterHits.length} config file(s)).`,
      );
    }
  }

  if (rootFormatters.length) evidence.push(`Formatter config: ${rootFormatters.join(', ')}.`);
  if (subprojectFormatterHits.length > 0) {
    if (subprojectFormatterHits.length <= 4) {
      const details = subprojectFormatterHits.map((h) => h.file).join(', ');
      evidence.push(`Formatter config found in workspace subprojects: ${details}.`);
    } else {
      const distinctPkgs = new Set(subprojectFormatterHits.map((h) => h.relPath)).size;
      evidence.push(
        `Formatter configs detected across ${distinctPkgs} workspace package(s) (${subprojectFormatterHits.length} config file(s)).`,
      );
    }
  }

  if (rootPyprojectLint || subprojectPyprojectLint) {
    evidence.push('pyproject.toml declares lint/format tool config.');
  }
  if (rootPkgConfig.hasEslint || subprojectEslintPkg) {
    evidence.push('package.json declares eslintConfig configuration.');
  }
  if (rootPkgConfig.hasPrettier || subprojectPrettierPkg) {
    evidence.push('package.json declares prettier formatting configuration.');
  }

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
