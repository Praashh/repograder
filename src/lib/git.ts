import { execSync } from 'child_process';
import fs from 'fs';

export function isGitRepo(root: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function lastCommitTime(root: string, relPath: string): number | null {
  try {
    const out = execSync(`git log -1 --format=%ct -- ${JSON.stringify(relPath)}`, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out ? parseInt(out, 10) : null;
  } catch {
    return null;
  }
}

/** Unix timestamp (seconds) of the most recent commit anywhere in the repo. */
export function lastRepoCommitTime(root: string): number | null {
  try {
    const out = execSync('git log -1 --format=%ct', {
      cwd: root,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out ? parseInt(out, 10) : null;
  } catch {
    return null;
  }
}

/** Fallback: mtime (seconds) from the filesystem when git isn't usable. */
export function fileMtime(absPath: string): number | null {
  try {
    return Math.floor(fs.statSync(absPath).mtimeMs / 1000);
  } catch {
    return null;
  }
}
