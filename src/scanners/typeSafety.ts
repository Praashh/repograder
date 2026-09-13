import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';
import { detectWorkspaces, type WorkspacePackage } from '../lib/workspace';

const CI_CANDIDATES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  'azure-pipelines.yml',
  '.travis.yml',
  'bitbucket-pipelines.yml',
];

const CI_TYPE_CMD_RE =
  /\b(tsc(\s+-[a-z]+)*|typecheck|type-check|mypy|pyright|pytype|cargo\s+check|go\s+vet|phpstan|psalm|turbo(\s+run)?\s+typecheck|pnpm(\s+-r|\s+--filter\s+\S+)?\s+typecheck|yarn\s+(workspaces\s+run\s+)?typecheck)\b/i;

const CI_BUILD_OR_TEST_CMD_RE =
  /\b(npm\s+(run\s+)?(test|build)|yarn\s+(run\s+|workspaces\s+run\s+)?(test|build)|pnpm\s+(-r\s+|--filter\s+\S+\s+)?(run\s+)?(test|build)|bun\s+run\s+(test|build)|cargo\s+(test|build)|go\s+test|turbo(\s+run)?\s+(test|build)|nx\s+(run-many\s+-t|run)\s+(test|build))\b/i;

function readJsonFileSafe(filePath: string): any {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function checkTsConfigStrictness(
  tsConfigPath: string,
  visited: Set<string> = new Set(),
): { exists: boolean; isStrict: boolean } {
  const normPath = path.resolve(tsConfigPath);
  if (visited.has(normPath)) return { exists: false, isStrict: false };
  visited.add(normPath);

  if (!fs.existsSync(normPath)) return { exists: false, isStrict: false };
  try {
    const parsed = readJsonFileSafe(normPath);
    if (parsed && parsed.compilerOptions) {
      const co = parsed.compilerOptions;
      if (co.strict === true) return { exists: true, isStrict: true };
      if (co.noImplicitAny === true && co.strictNullChecks === true)
        return { exists: true, isStrict: true };
      if (co.strict === false) return { exists: true, isStrict: false };
    }

    if (parsed && typeof parsed.extends === 'string' && parsed.extends.startsWith('.')) {
      const candidate = path.resolve(path.dirname(normPath), parsed.extends);
      for (const p of [candidate, candidate.endsWith('.json') ? candidate : `${candidate}.json`]) {
        if (fs.existsSync(p) && checkTsConfigStrictness(p, visited).isStrict) {
          return { exists: true, isStrict: true };
        }
      }
    }

    const raw = fs.readFileSync(normPath, 'utf8');
    const hasStrict = /"strict"\s*:\s*true/i.test(raw);
    const hasParts =
      /"noImplicitAny"\s*:\s*true/i.test(raw) && /"strictNullChecks"\s*:\s*true/i.test(raw);
    return { exists: true, isStrict: hasStrict || hasParts };
  } catch {
    return { exists: true, isStrict: false };
  }
}

function checkPackageJsonScripts(
  root: string,
  workspacePackages: WorkspacePackage[] = [],
): { hasPackageJson: boolean; hasTypecheckScript: boolean; buildOrTestRunsTsc: boolean } {
  const targets = [root, ...workspacePackages.map((p) => p.path)];
  let hasPackageJson = false;
  let hasTypecheckScript = false;
  let buildOrTestRunsTsc = false;

  for (const dir of targets) {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    hasPackageJson = true;
    try {
      const scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};
      if (Object.keys(scripts).some((k) => /typecheck|type-check/i.test(k)))
        hasTypecheckScript = true;
      if (
        ['build', 'test'].some((k) =>
          /\b(tsc|turbo\s+run\s+typecheck|pnpm.*typecheck)\b/i.test(String(scripts[k] || '')),
        )
      ) {
        buildOrTestRunsTsc = true;
      }
    } catch {
      // ignore
    }
  }
  return { hasPackageJson, hasTypecheckScript, buildOrTestRunsTsc };
}

function ciEnforcesTypeCheck(root: string, buildOrTestRunsTsc: boolean): boolean {
  for (const candidate of CI_CANDIDATES) {
    const p = path.join(root, candidate);
    if (!fs.existsSync(p)) continue;
    try {
      const files = candidate.endsWith('workflows')
        ? fs
            .readdirSync(p)
            .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
            .map((f) => path.join(p, f))
        : [p];
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (
            CI_TYPE_CMD_RE.test(content) ||
            (buildOrTestRunsTsc && CI_BUILD_OR_TEST_CMD_RE.test(content))
          ) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function checkPythonTypingInDir(dir: string): {
  hasPythonManifest: boolean;
  hasTypeChecker: boolean;
  toolName?: string;
  isStrict: boolean;
} {
  const pyproject = path.join(dir, 'pyproject.toml');
  const mypyIni = path.join(dir, 'mypy.ini');
  const dotMypy = path.join(dir, '.mypy.ini');
  const pyright = path.join(dir, 'pyrightconfig.json');

  const hasPythonManifest = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.cfg'].some(
    (f) => fs.existsSync(path.join(dir, f)),
  );

  if (fs.existsSync(pyproject)) {
    try {
      const content = fs.readFileSync(pyproject, 'utf8');
      const hasMypy = /\[tool\.mypy\]/.test(content);
      const hasPyright = /\[tool\.pyright\]/.test(content);
      if (hasMypy || hasPyright) {
        const isStrict =
          /strict\s*=\s*true/i.test(content) ||
          /disallow_untyped_defs\s*=\s*true/i.test(content) ||
          /typeCheckingMode\s*=\s*["']strict["']/i.test(content);
        return {
          hasPythonManifest: true,
          hasTypeChecker: true,
          toolName: hasMypy ? 'mypy' : 'pyright',
          isStrict,
        };
      }
    } catch {
      // ignore
    }
  }

  const iniPath = fs.existsSync(mypyIni) ? mypyIni : fs.existsSync(dotMypy) ? dotMypy : null;
  if (iniPath) {
    try {
      const content = fs.readFileSync(iniPath, 'utf8');
      const isStrict =
        /strict\s*=\s*(true|1)/i.test(content) ||
        /disallow_untyped_defs\s*=\s*(true|1)/i.test(content);
      return {
        hasPythonManifest: true,
        hasTypeChecker: true,
        toolName: path.basename(iniPath),
        isStrict,
      };
    } catch {
      return {
        hasPythonManifest: true,
        hasTypeChecker: true,
        toolName: path.basename(iniPath),
        isStrict: false,
      };
    }
  }

  if (fs.existsSync(pyright)) {
    try {
      const parsed = readJsonFileSafe(pyright);
      const isStrict = parsed?.typeCheckingMode === 'strict' || parsed?.strict?.length > 0;
      return {
        hasPythonManifest: true,
        hasTypeChecker: true,
        toolName: 'pyrightconfig.json',
        isStrict: Boolean(isStrict),
      };
    } catch {
      return {
        hasPythonManifest: true,
        hasTypeChecker: true,
        toolName: 'pyrightconfig.json',
        isStrict: false,
      };
    }
  }

  return { hasPythonManifest, hasTypeChecker: false, isStrict: false };
}

function checkPythonTyping(
  root: string,
  workspacePackages: WorkspacePackage[] = [],
): { hasPythonManifest: boolean; hasTypeChecker: boolean; toolName?: string; isStrict: boolean } {
  const rootResult = checkPythonTypingInDir(root);
  if (rootResult.hasPythonManifest) return rootResult;
  for (const pkg of workspacePackages) {
    const pkgResult = checkPythonTypingInDir(pkg.path);
    if (pkgResult.hasPythonManifest) return pkgResult;
  }
  return rootResult;
}

interface DiscoveredTsConfig {
  absPath: string;
  displayPath: string;
  isStrict: boolean;
  isRoot: boolean;
}

function scan(root: string): ScanResult {
  try {
    const evidence: string[] = [];
    const remediationTips: string[] = [];
    const scores: number[] = [];

    const workspace = detectWorkspaces(root);
    const { hasPackageJson, hasTypecheckScript, buildOrTestRunsTsc } = checkPackageJsonScripts(
      root,
      workspace.packages,
    );
    const ciHasTypecheck = ciEnforcesTypeCheck(root, buildOrTestRunsTsc);
    let evaluatedEcosystem = false;

    // 1. TypeScript / JavaScript Ecosystem (Root & Workspace Packages)
    const tsConfigCandidates = ['tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json'];
    const discoveredTsConfigs: DiscoveredTsConfig[] = [];

    for (const c of tsConfigCandidates) {
      const p = path.join(root, c);
      if (fs.existsSync(p)) {
        discoveredTsConfigs.push({
          absPath: p,
          displayPath: c,
          isStrict: checkTsConfigStrictness(p).isStrict,
          isRoot: true,
        });
      }
    }

    for (const pkg of workspace.packages) {
      for (const c of tsConfigCandidates) {
        const p = path.join(pkg.path, c);
        if (fs.existsSync(p)) {
          discoveredTsConfigs.push({
            absPath: p,
            displayPath: path.relative(root, p),
            isStrict: checkTsConfigStrictness(p).isStrict,
            isRoot: false,
          });
          break;
        }
      }
    }

    const jsConfigExists =
      fs.existsSync(path.join(root, 'jsconfig.json')) ||
      workspace.packages.some((pkg) => fs.existsSync(path.join(pkg.path, 'jsconfig.json')));

    if (discoveredTsConfigs.length > 0) {
      evaluatedEcosystem = true;
      const allStrict = discoveredTsConfigs.every((c) => c.isStrict);
      const nonStrict = discoveredTsConfigs.filter((c) => !c.isStrict);

      if (allStrict) {
        if (workspace.isMonorepo && discoveredTsConfigs.some((c) => !c.isRoot)) {
          const pkgCount = discoveredTsConfigs.filter((c) => !c.isRoot).length;
          evidence.push(
            `TypeScript configuration detected across ${pkgCount} workspace package(s) with strict mode enabled.`,
          );
        } else {
          evidence.push(
            `TypeScript configuration (${discoveredTsConfigs[0].displayPath}) detected with strict mode enabled.`,
          );
        }

        if (hasTypecheckScript) {
          evidence.push(
            workspace.isMonorepo
              ? 'Explicit typecheck script defined across workspace / package.json.'
              : 'package.json defines an explicit typecheck script.',
          );
        }

        if (ciHasTypecheck) {
          scores.push(5);
          evidence.push('Type checking is verified in CI workflow / build scripts.');
        } else {
          scores.push(4);
          evidence.push(
            'Strict TypeScript configured, but explicit type checking step was not confirmed in CI.',
          );
          remediationTips.push(
            'Add a type-check step (e.g. npx tsc --noEmit or turbo run typecheck) to your CI workflow for automated enforcement.',
          );
        }
      } else {
        scores.push(3);
        const nonStrictNames = nonStrict.map((c) => c.displayPath).join(', ');
        if (workspace.isMonorepo) {
          evidence.push(
            `TypeScript configuration detected across workspace, but strict mode is disabled in: ${nonStrictNames}.`,
          );
          remediationTips.push(
            'Enable "strict": true in tsconfig.json compilerOptions across all workspace packages to eliminate implicit any and null hazards.',
          );
        } else {
          evidence.push(
            `TypeScript configuration (${discoveredTsConfigs[0].displayPath}) detected, but strict mode is disabled.`,
          );
          remediationTips.push(
            'Enable "strict": true in tsconfig.json compilerOptions to eliminate implicit any and null hazards.',
          );
        }
      }
    } else if (jsConfigExists) {
      evaluatedEcosystem = true;
      scores.push(3);
      evidence.push('Found jsconfig.json providing partial JavaScript type intelligence.');
      remediationTips.push(
        'Upgrade to tsconfig.json or enable "checkJs": true to provide compile-time type guarantees.',
      );
    } else if (hasPackageJson) {
      evaluatedEcosystem = true;
      scores.push(2);
      evidence.push(
        workspace.isMonorepo
          ? 'Workspace packages detected without TypeScript or static type checker configuration.'
          : 'Node/JavaScript project detected without TypeScript or static type checker configuration.',
      );
      remediationTips.push(
        'Initialize TypeScript with "npx tsc --init" or configure a type checker to assist AI code authoring.',
      );
    }

    // 2. Python Ecosystem
    const pythonStatus = checkPythonTyping(root, workspace.packages);
    if (pythonStatus.hasPythonManifest) {
      evaluatedEcosystem = true;
      if (pythonStatus.hasTypeChecker) {
        if (pythonStatus.isStrict) {
          evidence.push(
            `Python static type checker configured with strict rules (${pythonStatus.toolName}).`,
          );
          if (ciHasTypecheck) {
            scores.push(5);
            evidence.push('Python type checking is verified in CI.');
          } else {
            scores.push(4);
            evidence.push(
              `Strict Python typing configured (${pythonStatus.toolName}), but not verified in CI.`,
            );
            remediationTips.push(
              `Add a type-check step (e.g. ${pythonStatus.toolName || 'mypy'} .) to your CI workflow.`,
            );
          }
        } else {
          scores.push(3);
          evidence.push(
            `Python type checker configured (${pythonStatus.toolName}), but strict mode is not fully enabled.`,
          );
          remediationTips.push(
            'Enable strict type checking in your mypy or pyright configuration (e.g. strict = true).',
          );
        }
      } else {
        scores.push(2);
        evidence.push('Python project detected without static type checker (mypy or pyright).');
        remediationTips.push(
          'Add mypy (mypy.ini or pyproject.toml [tool.mypy]) or pyright to detect type errors before execution.',
        );
      }
    }

    // 3. Inherently Statically Typed Languages
    const staticLanguages: string[] = [];
    const checkPaths = [root, ...workspace.packages.map((p) => p.path)];
    if (checkPaths.some((p) => fs.existsSync(path.join(p, 'Cargo.toml'))))
      staticLanguages.push('Rust (Cargo.toml)');
    if (checkPaths.some((p) => fs.existsSync(path.join(p, 'go.mod'))))
      staticLanguages.push('Go (go.mod)');
    if (
      checkPaths.some(
        (p) =>
          fs.existsSync(path.join(p, 'pom.xml')) ||
          fs.existsSync(path.join(p, 'build.gradle')) ||
          fs.existsSync(path.join(p, 'build.gradle.kts')),
      )
    ) {
      staticLanguages.push('Java/Kotlin (Gradle/Maven)');
    }
    if (checkPaths.some((p) => fs.existsSync(path.join(p, 'Package.swift'))))
      staticLanguages.push('Swift (Package.swift)');

    if (staticLanguages.length > 0) {
      evaluatedEcosystem = true;
      evidence.push(
        `Inherently statically typed language detected: ${staticLanguages.join(', ')}.`,
      );
      if (ciHasTypecheck) {
        scores.push(5);
        evidence.push('Compiler static verification enforced in CI.');
      } else {
        scores.push(4);
        remediationTips.push(
          'Ensure build or compiler verification commands run in CI to catch type mismatches automatically.',
        );
      }
    }

    // 4. Other Dynamically Typed Languages (PHP, Ruby)
    if (checkPaths.some((p) => fs.existsSync(path.join(p, 'composer.json')))) {
      evaluatedEcosystem = true;
      const hasPhpstan = checkPaths.some(
        (p) =>
          fs.existsSync(path.join(p, 'phpstan.neon')) ||
          fs.existsSync(path.join(p, 'phpstan.neon.dist')),
      );
      const hasPsalm = checkPaths.some((p) => fs.existsSync(path.join(p, 'psalm.xml')));
      if (hasPhpstan || hasPsalm) {
        evidence.push(`PHP static analysis tool configured (${hasPhpstan ? 'PHPStan' : 'Psalm'}).`);
        scores.push(ciHasTypecheck ? 5 : 4);
      } else {
        scores.push(2);
        evidence.push(
          'PHP project detected without static analysis configuration (PHPStan/Psalm).',
        );
        remediationTips.push('Add PHPStan or Psalm configuration to provide static type analysis.');
      }
    }

    if (checkPaths.some((p) => fs.existsSync(path.join(p, 'Gemfile')))) {
      evaluatedEcosystem = true;
      const hasSorbet = checkPaths.some((p) => fs.existsSync(path.join(p, 'sorbet', 'config')));
      const hasSteep = checkPaths.some((p) => fs.existsSync(path.join(p, 'Steepfile')));
      if (hasSorbet || hasSteep) {
        evidence.push(`Ruby static typing tool configured (${hasSorbet ? 'Sorbet' : 'Steep'}).`);
        scores.push(ciHasTypecheck ? 5 : 4);
      } else {
        scores.push(2);
        evidence.push('Ruby project detected without static typing (Sorbet/Steep).');
        remediationTips.push(
          'Consider adopting Sorbet or Steep to establish type boundaries for AI agents.',
        );
      }
    }

    if (!evaluatedEcosystem || scores.length === 0) {
      evidence.push('No recognized typed or dynamically typed language manifests found.');
      return { score: 3, evidence, remediationTips, blocking: false };
    }

    const rawScore = Math.min(...scores);
    const score = Math.max(1, Math.min(5, rawScore));
    return { score, evidence, remediationTips, blocking: false };
  } catch {
    return {
      score: 3,
      evidence: ['Error analyzing type safety configuration; defaulted to neutral score.'],
      remediationTips: [],
      blocking: false,
    };
  }
}

export const id = 'typeSafety';
export const label = 'Type safety & static verification';
export { scan };
