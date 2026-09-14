import fs from 'fs';
import path from 'path';
import { initAgentsMd } from './init';
import { scan as scanTests } from './scanners/tests';
import { walk, isSourceFile } from './lib/walk';

export interface FixOptions {
  dryRun?: boolean;
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

export function runFix(root: string, options: FixOptions = {}): FixResult {
  const actions: FixAction[] = [];
  const dryRun = Boolean(options.dryRun);

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
  const hasPkg = fs.existsSync(path.join(root, 'package.json'));
  const hasPython =
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    fs.existsSync(path.join(root, 'requirements.txt'));
  const hasRust = fs.existsSync(path.join(root, 'Cargo.toml'));

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

  const appliedCount = actions.filter((a) => a.applied).length;
  const summary = dryRun
    ? `Dry run: identified ${actions.length} potential remediation action(s).`
    : `Applied ${appliedCount} remediation action(s).`;

  return { actions, summary };
}
