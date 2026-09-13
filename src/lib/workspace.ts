import fs from 'fs';
import path from 'path';
import { IGNORE_DIRS } from './walk';

export type WorkspaceType =
  'pnpm' | 'npm/yarn' | 'turborepo' | 'nx' | 'lerna' | 'cargo' | 'go' | 'uv' | 'convention';

export interface WorkspacePackage {
  name: string;
  path: string;
  relPath: string;
  manifestPath?: string;
}

export interface WorkspaceInfo {
  isMonorepo: boolean;
  type?: WorkspaceType;
  packages: WorkspacePackage[];
}

const CONVENTION_DIRS = ['packages', 'apps', 'services', 'libs', 'modules', 'crates', 'projects'];

function safeReadJson(filePath: string): any {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Parses pnpm-workspace.yaml lines to extract package globs.
 */
function parsePnpmWorkspace(root: string): string[] | null {
  const candidates = ['pnpm-workspace.yaml', 'pnpm-workspace.yml'];
  const found = candidates.find((c) => fs.existsSync(path.join(root, c)));
  if (!found) return null;

  try {
    const content = fs.readFileSync(path.join(root, found), 'utf8');
    const lines = content.split('\n');
    const patterns: string[] = [];
    let inPackagesSection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('packages:')) {
        inPackagesSection = true;
        continue;
      }

      if (inPackagesSection) {
        // Stop if a new top-level YAML key begins
        if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t') && !rawLine.startsWith('-')) {
          break;
        }
        const match = line.match(/^-\s*['"]?([^'"]+)['"]?/);
        if (match) {
          const pattern = match[1].trim();
          if (pattern) patterns.push(pattern);
        }
      }
    }
    return patterns;
  } catch {
    return null;
  }
}

/**
 * Parses Cargo.toml [workspace] members array.
 */
function parseCargoWorkspace(root: string): string[] | null {
  const cargoPath = path.join(root, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) return null;

  try {
    const content = fs.readFileSync(cargoPath, 'utf8');
    if (!/\[workspace\]/i.test(content)) return null;

    const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
    if (!membersMatch) return [];

    const memberLines = membersMatch[1];
    const patterns: string[] = [];
    const itemRegex = /"([^"]+)"|'([^']+)'/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(memberLines)) !== null) {
      const p = match[1] || match[2];
      if (p) patterns.push(p);
    }
    return patterns;
  } catch {
    return null;
  }
}

/**
 * Parses go.work use directives.
 */
function parseGoWork(root: string): string[] | null {
  const goWorkPath = path.join(root, 'go.work');
  if (!fs.existsSync(goWorkPath)) return null;

  try {
    const content = fs.readFileSync(goWorkPath, 'utf8');
    const patterns: string[] = [];
    const blockMatch = content.match(/use\s*\(([\s\S]*?)\)/);
    if (blockMatch) {
      const lines = blockMatch[1].split('\n');
      for (const raw of lines) {
        const line = raw.trim().replace(/^['"]|['"]$/g, '');
        if (line && !line.startsWith('//')) patterns.push(line);
      }
    }
    const singleMatches = content.matchAll(/^use\s+([^\s()]+)/gm);
    for (const m of singleMatches) {
      if (m[1]) patterns.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
    }
    return patterns;
  } catch {
    return null;
  }
}

//  Resolves a simple glob pattern (e.g. 'packages/*', 'apps/*', 'crates/core') to directories.
function resolvePatternDirs(root: string, pattern: string): string[] {
  if (pattern.startsWith('!')) return [];

  const cleanPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = cleanPattern.split('/');

  function expand(currentDir: string, index: number): string[] {
    if (index >= parts.length) {
      if (fs.existsSync(currentDir) && fs.statSync(currentDir).isDirectory()) {
        return [currentDir];
      }
      return [];
    }

    const part = parts[index];
    if (part === '*' || part === '**') {
      if (!fs.existsSync(currentDir)) return [];
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        let matched: string[] = [];
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

          const nextPath = path.join(currentDir, entry.name);
          if (part === '**' && index === parts.length - 1) {
            matched.push(nextPath);
            matched = matched.concat(expand(nextPath, index));
          } else {
            matched = matched.concat(expand(nextPath, index + 1));
          }
        }
        return matched;
      } catch {
        return [];
      }
    }

    const nextPath = path.join(currentDir, part);
    if (fs.existsSync(nextPath) && fs.statSync(nextPath).isDirectory()) {
      return expand(nextPath, index + 1);
    }
    return [];
  }

  return expand(root, 0);
}

function extractPackageInfo(dir: string, root: string): WorkspacePackage {
  const relPath = path.relative(root, dir);
  let name = path.basename(dir);
  let manifestPath: string | undefined;

  const pkgJsonPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    manifestPath = pkgJsonPath;
    const pkg = safeReadJson(pkgJsonPath);
    if (pkg && typeof pkg.name === 'string' && pkg.name.trim()) {
      name = pkg.name.trim();
    }
  } else {
    const cargoToml = path.join(dir, 'Cargo.toml');
    if (fs.existsSync(cargoToml)) {
      manifestPath = cargoToml;
      try {
        const content = fs.readFileSync(cargoToml, 'utf8');
        const match = content.match(/name\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) name = match[1];
      } catch {
        // ignore
      }
    }
  }

  return { name, path: dir, relPath, manifestPath };
}

// Detects whether root is a monorepo workspace and identifies subproject packages.
export function detectWorkspaces(root: string): WorkspaceInfo {
  try {
    // 1. pnpm workspaces
    const pnpmPatterns = parsePnpmWorkspace(root);
    if (pnpmPatterns !== null) {
      const packagePaths = new Set<string>();
      for (const pattern of pnpmPatterns) {
        for (const dir of resolvePatternDirs(root, pattern)) {
          packagePaths.add(dir);
        }
      }
      const packages = Array.from(packagePaths).map((dir) => extractPackageInfo(dir, root));
      return {
        isMonorepo: true,
        type: 'pnpm',
        packages,
      };
    }

    // 2. npm / yarn / bun workspaces & Turborepo / Nx / Lerna
    const pkgJsonPath = path.join(root, 'package.json');
    const hasPkgJson = fs.existsSync(pkgJsonPath);
    const rootPkg = hasPkgJson ? safeReadJson(pkgJsonPath) : null;
    const hasTurbo = fs.existsSync(path.join(root, 'turbo.json'));
    const hasNx = fs.existsSync(path.join(root, 'nx.json'));
    const hasLerna = fs.existsSync(path.join(root, 'lerna.json'));

    let npmWorkspacePatterns: string[] = [];
    if (rootPkg && rootPkg.workspaces) {
      if (Array.isArray(rootPkg.workspaces)) {
        npmWorkspacePatterns = rootPkg.workspaces;
      } else if (rootPkg.workspaces.packages && Array.isArray(rootPkg.workspaces.packages)) {
        npmWorkspacePatterns = rootPkg.workspaces.packages;
      }
    }

    if (hasLerna) {
      const lernaData = safeReadJson(path.join(root, 'lerna.json'));
      if (lernaData && Array.isArray(lernaData.packages) && npmWorkspacePatterns.length === 0) {
        npmWorkspacePatterns = lernaData.packages;
      }
    }

    if (npmWorkspacePatterns.length > 0) {
      const packagePaths = new Set<string>();
      for (const pattern of npmWorkspacePatterns) {
        for (const dir of resolvePatternDirs(root, pattern)) {
          packagePaths.add(dir);
        }
      }
      const packages = Array.from(packagePaths).map((dir) => extractPackageInfo(dir, root));
      const type: WorkspaceType = hasTurbo
        ? 'turborepo'
        : hasNx
          ? 'nx'
          : hasLerna
            ? 'lerna'
            : 'npm/yarn';
      return {
        isMonorepo: true,
        type,
        packages,
      };
    }

    // 3. Cargo workspace
    const cargoPatterns = parseCargoWorkspace(root);
    if (cargoPatterns !== null) {
      const packagePaths = new Set<string>();
      const patterns = cargoPatterns.length > 0 ? cargoPatterns : ['crates/*', 'packages/*'];
      for (const pattern of patterns) {
        for (const dir of resolvePatternDirs(root, pattern)) {
          packagePaths.add(dir);
        }
      }
      const packages = Array.from(packagePaths).map((dir) => extractPackageInfo(dir, root));
      return {
        isMonorepo: true,
        type: 'cargo',
        packages,
      };
    }

    // 4. Go workspace
    const goWorkPatterns = parseGoWork(root);
    if (goWorkPatterns !== null) {
      const packagePaths = new Set<string>();
      for (const pattern of goWorkPatterns) {
        for (const dir of resolvePatternDirs(root, pattern)) {
          packagePaths.add(dir);
        }
      }
      const packages = Array.from(packagePaths).map((dir) => extractPackageInfo(dir, root));
      return {
        isMonorepo: true,
        type: 'go',
        packages,
      };
    }

    // 5. Standalone Turborepo or Nx without explicit package.json workspaces
    if (hasTurbo || hasNx) {
      const packagePaths = new Set<string>();
      for (const cDir of ['packages/*', 'apps/*', 'services/*', 'libs/*']) {
        for (const dir of resolvePatternDirs(root, cDir)) {
          packagePaths.add(dir);
        }
      }
      const packages = Array.from(packagePaths).map((dir) => extractPackageInfo(dir, root));
      return {
        isMonorepo: true,
        type: hasTurbo ? 'turborepo' : 'nx',
        packages,
      };
    }

    // 6. Convention-based discovery (e.g. packages/* or apps/* containing manifests)
    const conventionPackages: WorkspacePackage[] = [];
    for (const cDir of CONVENTION_DIRS) {
      const dirPath = path.join(root, cDir);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

      try {
        const subDirs = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const sub of subDirs) {
          if (!sub.isDirectory() || IGNORE_DIRS.has(sub.name) || sub.name.startsWith('.')) continue;
          const subPath = path.join(dirPath, sub.name);
          const hasSubManifest =
            fs.existsSync(path.join(subPath, 'package.json')) ||
            fs.existsSync(path.join(subPath, 'tsconfig.json')) ||
            fs.existsSync(path.join(subPath, 'Cargo.toml')) ||
            fs.existsSync(path.join(subPath, 'pyproject.toml')) ||
            fs.existsSync(path.join(subPath, 'go.mod'));

          if (hasSubManifest) {
            conventionPackages.push(extractPackageInfo(subPath, root));
          }
        }
      } catch {
        // ignore read error
      }
    }

    if (conventionPackages.length > 0) {
      return {
        isMonorepo: true,
        type: 'convention',
        packages: conventionPackages,
      };
    }

    return {
      isMonorepo: false,
      packages: [],
    };
  } catch {
    return {
      isMonorepo: false,
      packages: [],
    };
  }
}
