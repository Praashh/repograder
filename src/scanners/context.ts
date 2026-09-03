import fs from 'fs';
import path from 'path';
import { fileExistsCI } from '../lib/walk';
import * as git from '../lib/git';
import type { ScanResult } from '../types';

const AGENT_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'GEMINI.md'];
const README_NAMES = ['README.md', 'README', 'README.rst', 'README.txt'];
const TASK_RUNNER_FILES = ['Makefile', 'justfile', 'Taskfile.yml', 'Taskfile.yaml', 'Taskfile.json'];

const STALE_DAYS_THRESHOLD = 90; // context file untouched for 90+ days while repo is active

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  let score = 1;

  const readmePath = fileExistsCI(root, README_NAMES);
  const agentFilePath = fileExistsCI(root, AGENT_FILE_NAMES);
  const claudeDirAgents = fs.existsSync(path.join(root, '.claude'))
    ? fileExistsCI(path.join(root, '.claude'), ['CLAUDE.md'])
    : null;

  if (!readmePath && !agentFilePath) {
    evidence.push('No README or agent-specific context file found.');
    return { score: 1, evidence, blocking: false };
  }

  if (readmePath && !agentFilePath && !claudeDirAgents) {
    score = 2;
    evidence.push(`README found (${path.basename(readmePath)}), but no AGENTS.md/CLAUDE.md.`);
  }

  const chosenAgentFile = agentFilePath || claudeDirAgents;
  if (chosenAgentFile) {
    score = 3;
    evidence.push(`Agent context file found: ${path.relative(root, chosenAgentFile)}.`);

    // Freshness check
    const isGitRepo = git.isGitRepo(root);
    const relAgentFile = path.relative(root, chosenAgentFile);
    const fileTime = isGitRepo
      ? git.lastCommitTime(root, relAgentFile)
      : git.fileMtime(chosenAgentFile);
    const repoTime = isGitRepo ? git.lastRepoCommitTime(root) : null;

    if (fileTime && repoTime) {
      const gapDays = (repoTime - fileTime) / 86400;
      if (gapDays < STALE_DAYS_THRESHOLD) {
        score += 1;
        evidence.push(`Context file updated recently (${Math.round(gapDays)}d before latest commit).`);
      } else {
        evidence.push(
          `Context file appears stale (${Math.round(gapDays)}d since last touched vs. latest commit) — may not reflect current codebase.`,
        );
      }
    }

    // Does it actually contain operational content, or is it a stub?
    try {
      const content = fs.readFileSync(chosenAgentFile, 'utf8').toLowerCase();
      const hasCommands = /\b(test|build|lint|typecheck|install|run)\b/.test(content);
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      if (hasCommands && wordCount > 40) {
        score += 1;
        evidence.push('Context file includes concrete commands (build/test/lint), not just a stub.');
      } else {
        evidence.push('Context file is thin — missing concrete build/test/lint commands.');
      }
    } catch {
      // ignore read errors
    }

    // Task runner bonus: a Makefile/justfile gives agents a clear, unified entry point
    const taskRunner = TASK_RUNNER_FILES.find((f) => fs.existsSync(path.join(root, f)));
    if (taskRunner) {
      score = Math.min(5, score + 1);
      evidence.push(`Task runner found (${taskRunner}) — agents have a clear entry point for common commands.`);
    }
  }

  score = Math.max(1, Math.min(5, score));
  return { score, evidence, blocking: false };
}

export const id = 'context';
export const label = 'Agent context freshness';
export { scan };
