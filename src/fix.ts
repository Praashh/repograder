import fs from 'fs';
import path from 'path';
import { initAgentsMd } from './init';
import { scan as scanTests } from './scanners/tests';
import { walk, isSourceFile } from './lib/walk';

export interface FixOptions {
  dryRun?: boolean;
  skipDevcontainer?: boolean;
  skipCi?: boolean;
}

export interface FixAction {
  id: string;
  description: string;
  file: string;
  applied: boolean;
  content?: string;
}

export interface FixResult {
  actions: FixAction[];
  summary: string;
}

const COMMON_GITIGNORE_RULES: { pattern: string; ecosystems?: string[] }[] = [
  { pattern: '.env', ecosystems: ['universal'] },
  { pattern: '.env.*', ecosystems: ['universal'] },
  { pattern: '!.env.example', ecosystems: ['universal'] },
  { pattern: '.DS_Store', ecosystems: ['universal'] },
  { pattern: 'node_modules/', ecosystems: ['Node'] },
  { pattern: 'dist/', ecosystems: ['Node'] },
  { pattern: 'coverage/', ecosystems: ['universal'] },
  { pattern: '__pycache__/', ecosystems: ['Python'] },
  { pattern: '*.pyc', ecosystems: ['Python'] },
  { pattern: '.venv/', ecosystems: ['Python'] },
  { pattern: 'target/', ecosystems: ['Rust'] },
];

const CONTAINER_FILES = [
  '.devcontainer/devcontainer.json',
  '.devcontainer.json',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yaml',
  'compose.yml',
  'shell.nix',
  'default.nix',
  'flake.nix',
  '.envrc',
  'Vagrantfile',
];

const CI_DIRS = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  '.travis.yml',
  'bitbucket-pipelines.yml',
];

export function runFix(root: string, options: FixOptions = {}): FixResult {
  const actions: FixAction[] = [];
  const dryRun = Boolean(options.dryRun);

  const hasPkg = fs.existsSync(path.join(root, 'package.json'));
  const hasPython =
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    fs.existsSync(path.join(root, 'requirements.txt')) ||
    fs.existsSync(path.join(root, 'Pipfile'));
  const hasRust = fs.existsSync(path.join(root, 'Cargo.toml'));
  const hasGo = fs.existsSync(path.join(root, 'go.mod'));

  // 1. AGENTS.md check
  const agentsPath = path.join(root, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    actions.push({
      id: 'init-agents-md',
      description: 'Scaffold tailored AGENTS.md context documentation',
      file: 'AGENTS.md',
      applied: !dryRun,
    });
    if (!dryRun) {
      initAgentsMd(root);
    }
  }

  // 2. .gitignore check & remediation
  const gitignorePath = path.join(root, '.gitignore');
  const activeEcosystems = new Set<string>(['universal']);
  if (hasPkg) activeEcosystems.add('Node');
  if (hasPython) activeEcosystems.add('Python');
  if (hasRust) activeEcosystems.add('Rust');

  const neededPatterns = COMMON_GITIGNORE_RULES.filter(
    (rule) => !rule.ecosystems || rule.ecosystems.some((e) => activeEcosystems.has(e)),
  ).map((r) => r.pattern);

  if (!fs.existsSync(gitignorePath)) {
    const content = ['# Standard ignore rules', ...neededPatterns, ''].join('\n');
    actions.push({
      id: 'create-gitignore',
      description: 'Create missing .gitignore with standard ignore patterns',
      file: '.gitignore',
      applied: !dryRun,
      content,
    });
    if (!dryRun) {
      fs.writeFileSync(gitignorePath, content, 'utf8');
    }
  } else {
    try {
      const existing = fs.readFileSync(gitignorePath, 'utf8');
      const lines = new Set(
        existing
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      );
      const missing = neededPatterns.filter((p) => !lines.has(p));

      if (missing.length > 0) {
        const appended = ['\n# Added by repograder fix', ...missing, ''].join('\n');
        actions.push({
          id: 'update-gitignore',
          description: `Add ${missing.length} missing pattern(s) to .gitignore (${missing.join(', ')})`,
          file: '.gitignore',
          applied: !dryRun,
          content: appended,
        });
        if (!dryRun) {
          fs.appendFileSync(gitignorePath, appended, 'utf8');
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. .env.example remediation
  const envExamplePath = path.join(root, '.env.example');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envExamplePath)) {
    const discoveredKeys = new Set<string>();

    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            let key = trimmed.slice(0, eqIdx).trim();
            if (key.startsWith('export ')) key = key.replace('export ', '').trim();
            if (/^[A-Z0-9_]+$/i.test(key)) {
              discoveredKeys.add(key);
            }
          }
        }
      } catch {
        // ignore
      }
    } else {
      // Search source files for process.env or os.environ
      walk(
        root,
        (abs) => {
          if (!isSourceFile(abs)) return;
          try {
            const content = fs.readFileSync(abs, 'utf8');
            const nodeMatches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
            for (const m of nodeMatches) {
              if (m[1] && m[1].length > 1) discoveredKeys.add(m[1]);
            }
            const pyMatches = content.matchAll(/os\.environ(?:\.get)?\(['"]([A-Z0-9_]+)['"]\)/g);
            for (const m of pyMatches) {
              if (m[1] && m[1].length > 1) discoveredKeys.add(m[1]);
            }
          } catch {
            // ignore
          }
        },
        { maxFiles: 500 },
      );
    }

    if (discoveredKeys.size > 0) {
      const lines = [
        '# Example Environment Configuration',
        '# Auto-generated by repograder fix',
        '',
        ...Array.from(discoveredKeys)
          .sort()
          .map((k) => `${k}=your_${k.toLowerCase()}_here`),
        '',
      ];
      const content = lines.join('\n');
      actions.push({
        id: 'create-env-example',
        description: `Create .env.example stub with ${discoveredKeys.size} variable template(s)`,
        file: '.env.example',
        applied: !dryRun,
        content,
      });
      if (!dryRun) {
        fs.writeFileSync(envExamplePath, content, 'utf8');
      }
    }
  }

  // 4. Test stub scaffolding if tests score is poor
  try {
    const testScore = scanTests(root);
    if (testScore.score <= 2) {
      if (hasPkg) {
        const testDir = path.join(root, 'test');
        const testFile = path.join(testDir, 'smoke.test.js');
        if (!fs.existsSync(testFile)) {
          const content = `// Smoke test scaffolded by repograder fix\nconst assert = require('assert');\n\nassert.strictEqual(1 + 1, 2, 'basic math should work');\nconsole.log('Smoke test passed.');\n`;
          actions.push({
            id: 'create-test-stub',
            description: 'Scaffold basic test suite stub at test/smoke.test.js',
            file: 'test/smoke.test.js',
            applied: !dryRun,
            content,
          });
          if (!dryRun) {
            if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
            fs.writeFileSync(testFile, content, 'utf8');
          }
        }
      } else if (hasPython) {
        const testsDir = path.join(root, 'tests');
        const testFile = path.join(testsDir, 'test_smoke.py');
        if (!fs.existsSync(testFile)) {
          const content = `# Smoke test scaffolded by repograder fix\ndef test_smoke():\n    assert 1 + 1 == 2\n`;
          actions.push({
            id: 'create-test-stub',
            description: 'Scaffold pytest stub at tests/test_smoke.py',
            file: 'tests/test_smoke.py',
            applied: !dryRun,
            content,
          });
          if (!dryRun) {
            if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });
            fs.writeFileSync(testFile, content, 'utf8');
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 5. Container & Reproducible Environment Scaffolding (.devcontainer/devcontainer.json)
  if (!options.skipDevcontainer) {
    const devcontainerDir = path.join(root, '.devcontainer');
    const devcontainerFile = path.join(devcontainerDir, 'devcontainer.json');
    const hasAnyContainer =
      CONTAINER_FILES.some((f) => fs.existsSync(path.join(root, f))) ||
      fs.existsSync(devcontainerDir);

    if (!hasAnyContainer) {
      let image = 'mcr.microsoft.com/devcontainers/base:bookworm';
      let postCommand = '';

      if (hasPkg) {
        image = 'mcr.microsoft.com/devcontainers/typescript-node:20-bookworm';
        postCommand = fs.existsSync(path.join(root, 'pnpm-lock.yaml'))
          ? 'pnpm install'
          : fs.existsSync(path.join(root, 'yarn.lock'))
            ? 'yarn install'
            : 'npm install';
      } else if (hasPython) {
        image = 'mcr.microsoft.com/devcontainers/python:3.11-bookworm';
        postCommand = fs.existsSync(path.join(root, 'requirements.txt'))
          ? 'pip install -r requirements.txt'
          : 'pip install -e .';
      } else if (hasRust) {
        image = 'mcr.microsoft.com/devcontainers/rust:1-bookworm';
        postCommand = 'cargo check';
      } else if (hasGo) {
        image = 'mcr.microsoft.com/devcontainers/go:1.22-bookworm';
        postCommand = 'go mod download';
      }

      const devcontainerConfig: Record<string, unknown> = {
        name: path.basename(root) || 'project',
        image,
      };
      if (postCommand) {
        devcontainerConfig.postCreateCommand = postCommand;
      }

      const content = JSON.stringify(devcontainerConfig, null, 2) + '\n';
      actions.push({
        id: 'create-devcontainer',
        description: `Scaffold reproducible devcontainer (${image})`,
        file: '.devcontainer/devcontainer.json',
        applied: !dryRun,
        content,
      });

      if (!dryRun) {
        if (!fs.existsSync(devcontainerDir)) fs.mkdirSync(devcontainerDir, { recursive: true });
        fs.writeFileSync(devcontainerFile, content, 'utf8');
      }
    }
  }

  // 6. Standards Scaffolding (.editorconfig)
  const editorconfigPath = path.join(root, '.editorconfig');
  if (!fs.existsSync(editorconfigPath)) {
    const editorConfigContent = [
      '# EditorConfig configuration: https://EditorConfig.org',
      'root = true',
      '',
      '[*]',
      'indent_style = space',
      'indent_size = 2',
      'end_of_line = lf',
      'charset = utf-8',
      'trim_trailing_whitespace = true',
      'insert_final_newline = true',
      '',
      '[*.py]',
      'indent_size = 4',
      '',
      '[*.rs]',
      'indent_size = 4',
      '',
      '[Makefile]',
      'indent_style = tab',
      '',
    ].join('\n');

    actions.push({
      id: 'create-editorconfig',
      description: 'Scaffold universal code style standards (.editorconfig)',
      file: '.editorconfig',
      applied: !dryRun,
      content: editorConfigContent,
    });

    if (!dryRun) {
      fs.writeFileSync(editorconfigPath, editorConfigContent, 'utf8');
    }
  }

  // 7. Automated Dependency Updates (.github/dependabot.yml)
  const dependabotPath = path.join(root, '.github', 'dependabot.yml');
  const hasDependabotOrRenovate =
    fs.existsSync(dependabotPath) ||
    fs.existsSync(path.join(root, '.github', 'dependabot.yaml')) ||
    fs.existsSync(path.join(root, 'renovate.json')) ||
    fs.existsSync(path.join(root, '.renovaterc')) ||
    fs.existsSync(path.join(root, '.renovaterc.json'));

  if (!hasDependabotOrRenovate && (hasPkg || hasPython || hasRust || hasGo)) {
    const ecosystems: { eco: string; dir: string }[] = [];
    if (hasPkg) ecosystems.push({ eco: 'npm', dir: '/' });
    if (hasPython) ecosystems.push({ eco: 'pip', dir: '/' });
    if (hasRust) ecosystems.push({ eco: 'cargo', dir: '/' });
    if (hasGo) ecosystems.push({ eco: 'gomod', dir: '/' });
    ecosystems.push({ eco: 'github-actions', dir: '/' });

    const dependabotLines = [
      '# Dependabot configuration scaffolded by repograder fix',
      'version: 2',
      'updates:',
      ...ecosystems.flatMap(({ eco, dir }) => [
        `  - package-ecosystem: "${eco}"`,
        `    directory: "${dir}"`,
        '    schedule:',
        '      interval: "weekly"',
      ]),
      '',
    ];

    const content = dependabotLines.join('\n');
    actions.push({
      id: 'create-dependabot',
      description: 'Configure automated dependency updates (.github/dependabot.yml)',
      file: '.github/dependabot.yml',
      applied: !dryRun,
      content,
    });

    if (!dryRun) {
      const ghDir = path.join(root, '.github');
      if (!fs.existsSync(ghDir)) fs.mkdirSync(ghDir, { recursive: true });
      fs.writeFileSync(dependabotPath, content, 'utf8');
    }
  }

  // 8. CI Workflow Scaffolding (.github/workflows/agent-ci.yml)
  if (!options.skipCi) {
    const hasAnyCi = CI_DIRS.some((d) => fs.existsSync(path.join(root, d)));
    if (!hasAnyCi && (hasPkg || hasPython || hasRust || hasGo)) {
      const workflowPath = path.join(root, '.github', 'workflows', 'agent-ci.yml');
      const workflowLines = [
        'name: Agent Readiness & CI Quality Gate',
        '',
        'on:',
        '  push:',
        '    branches: [main, master]',
        '  pull_request:',
        '    branches: [main, master]',
        '',
        'jobs:',
        '  verify:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Checkout code',
        '        uses: actions/checkout@v4',
        '',
      ];

      if (hasPkg) {
        workflowLines.push(
          '      - name: Setup Node.js',
          '        uses: actions/setup-node@v4',
          '        with:',
          '          node-version: 20',
          '          cache: npm',
          '',
          '      - name: Install dependencies',
          '        run: npm ci || npm install',
          '',
          '      - name: Run tests',
          '        run: npm test',
          '',
        );
      } else if (hasPython) {
        workflowLines.push(
          '      - name: Setup Python',
          '        uses: actions/setup-python@v5',
          '        with:',
          '          python-version: "3.11"',
          '',
          '      - name: Install dependencies',
          '        run: pip install -r requirements.txt || pip install pytest',
          '',
          '      - name: Run tests',
          '        run: pytest',
          '',
        );
      } else if (hasRust) {
        workflowLines.push(
          '      - name: Run Cargo Check & Test',
          '        run: |',
          '          cargo check',
          '          cargo test',
          '',
        );
      } else if (hasGo) {
        workflowLines.push(
          '      - name: Setup Go',
          '        uses: actions/setup-go@v5',
          '        with:',
          '          go-version: "1.22"',
          '',
          '      - name: Run tests',
          '        run: go test ./...',
          '',
        );
      }

      const content = workflowLines.join('\n');
      actions.push({
        id: 'create-ci-workflow',
        description: 'Scaffold basic CI verification workflow (.github/workflows/agent-ci.yml)',
        file: '.github/workflows/agent-ci.yml',
        applied: !dryRun,
        content,
      });

      if (!dryRun) {
        const workflowsDir = path.join(root, '.github', 'workflows');
        if (!fs.existsSync(workflowsDir)) fs.mkdirSync(workflowsDir, { recursive: true });
        fs.writeFileSync(workflowPath, content, 'utf8');
      }
    }
  }

  const appliedCount = actions.filter((a) => a.applied).length;
  const summary = dryRun
    ? `Dry run: identified ${actions.length} potential remediation action(s).`
    : `Applied ${appliedCount} remediation action(s).`;

  return { actions, summary };
}
