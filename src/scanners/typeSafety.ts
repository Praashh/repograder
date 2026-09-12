import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';

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
  /\b(tsc|typecheck|mypy|pyright|pytype|cargo\s+check|go\s+vet|phpstan|psalm)\b/i;

const CI_BUILD_OR_TEST_CMD_RE =
  /\b(npm\s+(run\s+)?(test|build)|yarn\s+(test|build)|pnpm\s+(test|build)|bun\s+run\s+(test|build)|cargo\s+(test|build)|go\s+test)\b/i;

function readJsonFileSafe(filePath: string): any {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    // Strip single-line and multi-line comments + trailing commas commonly found in tsconfig.json
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function checkTsConfigStrictness(tsConfigPath: string): { exists: boolean; isStrict: boolean } {
  if (!fs.existsSync(tsConfigPath)) return { exists: false, isStrict: false };
  try {
    const parsed = readJsonFileSafe(tsConfigPath);
    if (parsed && parsed.compilerOptions) {
      const co = parsed.compilerOptions;
      if (co.strict === true) return { exists: true, isStrict: true };
      if (co.noImplicitAny === true && co.strictNullChecks === true) {
        return { exists: true, isStrict: true };
      }
    }
    // Fallback regex in case JSON parsing failed due to complex comments
    const raw = fs.readFileSync(tsConfigPath, 'utf8');
    const hasStrict = /"strict"\s*:\s*true/i.test(raw);
    const hasStrictParts =
      /"noImplicitAny"\s*:\s*true/i.test(raw) && /"strictNullChecks"\s*:\s*true/i.test(raw);
    return { exists: true, isStrict: hasStrict || hasStrictParts };
  } catch {
    return { exists: true, isStrict: false };
  }
}

function checkPackageJsonScripts(root: string): {
  hasPackageJson: boolean;
  hasTypecheckScript: boolean;
  buildOrTestRunsTsc: boolean;
} {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { hasPackageJson: false, hasTypecheckScript: false, buildOrTestRunsTsc: false };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const hasTypecheckScript = Object.keys(scripts).some((k) => /typecheck|type-check/i.test(k));
    const buildOrTestRunsTsc = ['build', 'test'].some((k) =>
      /\btsc\b/i.test(String(scripts[k] || '')),
    );
    return { hasPackageJson: true, hasTypecheckScript, buildOrTestRunsTsc };
  } catch {
    return { hasPackageJson: true, hasTypecheckScript: false, buildOrTestRunsTsc: false };
  }
}

function ciEnforcesTypeCheck(root: string, buildOrTestRunsTsc: boolean): boolean {
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
          const content = fs.readFileSync(file, 'utf8');
          if (CI_TYPE_CMD_RE.test(content)) return true;
          if (buildOrTestRunsTsc && CI_BUILD_OR_TEST_CMD_RE.test(content)) return true;
        } catch {
          // ignore unreadable file
        }
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function checkPythonTyping(root: string): {
  hasPythonManifest: boolean;
  hasTypeChecker: boolean;
  toolName?: string;
  isStrict: boolean;
} {
  const pyprojectPath = path.join(root, 'pyproject.toml');
  const mypyIniPath = path.join(root, 'mypy.ini');
  const dotMypyIniPath = path.join(root, '.mypy.ini');
  const pyrightConfigPath = path.join(root, 'pyrightconfig.json');
  const setupCfgPath = path.join(root, 'setup.cfg');
  const requirementsTxt = path.join(root, 'requirements.txt');
  const pipfile = path.join(root, 'Pipfile');

  const hasPythonManifest =
    fs.existsSync(pyprojectPath) ||
    fs.existsSync(requirementsTxt) ||
    fs.existsSync(pipfile) ||
    fs.existsSync(setupCfgPath);

  // Check pyproject.toml
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
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

  // Check mypy.ini / .mypy.ini
  const iniPath = fs.existsSync(mypyIniPath)
    ? mypyIniPath
    : fs.existsSync(dotMypyIniPath)
      ? dotMypyIniPath
      : null;
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

  // Check pyrightconfig.json
  if (fs.existsSync(pyrightConfigPath)) {
    try {
      const parsed = readJsonFileSafe(pyrightConfigPath);
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

function scan(root: string): ScanResult {
  try {
    const evidence: string[] = [];
    const remediationTips: string[] = [];
    const scores: number[] = [];

    const { hasPackageJson, hasTypecheckScript, buildOrTestRunsTsc } =
      checkPackageJsonScripts(root);
    const ciHasTypecheck = ciEnforcesTypeCheck(root, buildOrTestRunsTsc);

    let evaluatedEcosystem = false;

    // 1. TypeScript / JavaScript Ecosystem
    const tsConfigCandidates = ['tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json'];
    const foundTsConfig = tsConfigCandidates.find((c) => fs.existsSync(path.join(root, c)));
    const jsConfigExists = fs.existsSync(path.join(root, 'jsconfig.json'));

    if (foundTsConfig) {
      evaluatedEcosystem = true;
      const { isStrict } = checkTsConfigStrictness(path.join(root, foundTsConfig));
      if (isStrict) {
        evidence.push(
          `TypeScript configuration (${foundTsConfig}) detected with strict mode enabled.`,
        );
        if (hasTypecheckScript) {
          evidence.push('package.json defines an explicit typecheck script.');
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
            'Add a type-check step (e.g. npx tsc --noEmit) to your CI workflow for automated enforcement.',
          );
        }
      } else {
        scores.push(3);
        evidence.push(
          `TypeScript configuration (${foundTsConfig}) detected, but strict mode is disabled.`,
        );
        remediationTips.push(
          'Enable "strict": true in tsconfig.json compilerOptions to eliminate implicit any and null hazards.',
        );
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
        'Node/JavaScript project detected without TypeScript or static type checker configuration.',
      );
      remediationTips.push(
        'Initialize TypeScript with "npx tsc --init" or configure a type checker to assist AI code authoring.',
      );
    }

    // 2. Python Ecosystem
    const pythonStatus = checkPythonTyping(root);
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
    if (fs.existsSync(path.join(root, 'Cargo.toml'))) staticLanguages.push('Rust (Cargo.toml)');
    if (fs.existsSync(path.join(root, 'go.mod'))) staticLanguages.push('Go (go.mod)');
    if (
      fs.existsSync(path.join(root, 'pom.xml')) ||
      fs.existsSync(path.join(root, 'build.gradle')) ||
      fs.existsSync(path.join(root, 'build.gradle.kts'))
    ) {
      staticLanguages.push('Java/Kotlin (Gradle/Maven)');
    }
    if (fs.existsSync(path.join(root, 'Package.swift')))
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
    if (fs.existsSync(path.join(root, 'composer.json'))) {
      evaluatedEcosystem = true;
      const hasPhpstan =
        fs.existsSync(path.join(root, 'phpstan.neon')) ||
        fs.existsSync(path.join(root, 'phpstan.neon.dist'));
      const hasPsalm = fs.existsSync(path.join(root, 'psalm.xml'));
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

    if (fs.existsSync(path.join(root, 'Gemfile'))) {
      evaluatedEcosystem = true;
      const hasSorbet = fs.existsSync(path.join(root, 'sorbet', 'config'));
      const hasSteep = fs.existsSync(path.join(root, 'Steepfile'));
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

    // If no specific ecosystem detected
    if (!evaluatedEcosystem || scores.length === 0) {
      evidence.push('No recognized typed or dynamically typed language manifests found.');
      return { score: 3, evidence, remediationTips, blocking: false };
    }

    // Score is the minimum across detected ecosystems (Weakest Link Principle)
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
