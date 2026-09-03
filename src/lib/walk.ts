import fs from 'fs';
import path from 'path';

export const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', 'env', 'coverage', '.next', '.nuxt',
  '.turbo', '.cache', 'bin', 'obj', '.gradle', '.idea', '.vscode',
  'tmp', 'temp', '.pytest_cache', 'site-packages', '.tox',
]);

const SOURCE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.cc', '.hpp', '.cs', '.rs',
  '.php', '.scala', '.ex', '.exs', '.vue', '.svelte',
]);

type OnFile = (abs: string, rel: string, stat: fs.Stats) => void;
type WalkOptions = { maxFiles?: number };

/**
 * Recursively walk `root`, calling onFile(absPath, relPath, stat) for every
 * file not inside an ignored directory. Returns nothing; caller collects.
 */
export function walk(root: string, onFile: OnFile, { maxFiles = 20000 }: WalkOptions = {}): void {
  let count = 0;

  function _walk(dir: string): void {
    if (count >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= maxFiles) return;
      if (entry.name.startsWith('.') && !['.github', '.husky', '.gitignore'].includes(entry.name)) {
        // allow a few dotfiles/dirs we specifically care about, skip the rest
        if (entry.isDirectory() && !['.github', '.husky'].includes(entry.name)) continue;
        if (entry.isFile() && entry.name !== '.gitignore') {
          // still let known dotfiles (.eslintrc, .prettierrc, etc.) pass through below
        }
      }
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        _walk(abs);
      } else if (entry.isFile()) {
        count++;
        let stat: fs.Stats;
        try {
          stat = fs.statSync(abs);
        } catch {
          continue;
        }
        onFile(abs, rel, stat);
      }
    }
  }

  _walk(root);
}

export function isSourceFile(filePath: string): boolean {
  return SOURCE_EXT.has(path.extname(filePath));
}

export function countLines(filePath: string): number | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('\u0000')) return null; // binary guard
    return content.split('\n').length;
  } catch {
    return null;
  }
}

export function fileExistsCI(root: string, names: string[]): string | null {
  // case-insensitive-ish check for a small set of candidate filenames at root
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return null;
  }
  const lowerMap = new Map(entries.map((e) => [e.toLowerCase(), e]));
  for (const name of names) {
    const match = lowerMap.get(name.toLowerCase());
    if (match) return path.join(root, match);
  }
  return null;
}

export function globExistsAnywhere(
  root: string,
  predicate: (rel: string) => boolean,
  opts?: WalkOptions,
): string[] {
  const hits: string[] = [];
  walk(root, (_abs, rel) => {
    if (predicate(rel)) hits.push(rel);
  }, opts);
  return hits;
}
