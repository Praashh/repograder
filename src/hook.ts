import fs from 'fs';
import path from 'path';

export function installGitHook(targetDir: string): { success: boolean; message: string } {
  const gitDir = path.join(targetDir, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return {
      success: false,
      message: `No .git directory found at "${targetDir}". Run git init first.`,
    };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const hookScript = `#!/bin/sh
# repograder pre-commit readiness gate
echo "🔍 Running repograder pre-commit check..."
npx repograder --fail-under 3
`;

  try {
    fs.writeFileSync(preCommitPath, hookScript, 'utf8');
    try {
      fs.chmodSync(preCommitPath, 0o755);
    } catch {
      // ignore chmod issues on non-posix systems
    }
    return {
      success: true,
      message: `Successfully installed pre-commit hook at ${preCommitPath}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to write pre-commit hook: ${msg}`,
    };
  }
}
