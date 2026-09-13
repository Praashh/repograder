import fs from 'fs';
import path from 'path';
import { fileExistsCI } from '../lib/walk';
import * as git from '../lib/git';
import type { ScanResult } from '../types';
import { detectWorkspaces } from '../lib/workspace';

const AGENT_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'GEMINI.md', '.windsurfrules'];
const README_NAMES = ['README.md', 'README', 'README.rst', 'README.txt'];
const ARCH_NAMES = ['ARCHITECTURE.md', 'CONTRIBUTING.md', 'docs/ARCHITECTURE.md'];
const TASK_RUNNER_FILES = [
  'Makefile',
  'justfile',
  'Taskfile.yml',
  'Taskfile.yaml',
  'Taskfile.json',
  'turbo.json',
  'nx.json',
  'pnpm-workspace.yaml',
  'lerna.json',
];

const STALE_DAYS_THRESHOLD = 90; // context file untouched for 90+ days while repo is active

function findModernAgentRules(root: string): string | null {
  // Cursor rules directory
  const cursorRulesDir = path.join(root, '.cursor', 'rules');
  if (fs.existsSync(cursorRulesDir)) {
    try {
      const files = fs
        .readdirSync(cursorRulesDir)
        .filter((f) => f.endsWith('.mdc') || f.endsWith('.md'));
      if (files.length > 0) return path.join('.cursor', 'rules', files[0]);
    } catch {
      // ignore
    }
  }

  // Copilot instructions
  const copilotInstructions = path.join(root, '.github', 'copilot-instructions.md');
  if (fs.existsSync(copilotInstructions)) return path.join('.github', 'copilot-instructions.md');

  // .claude/CLAUDE.md
  const claudeMd = path.join(root, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) return path.join('.claude', 'CLAUDE.md');

  // .agents directory
  const agentsDir = path.join(root, '.agents');
  if (fs.existsSync(agentsDir)) {
    const agentsFile = path.join(agentsDir, 'AGENTS.md');
    if (fs.existsSync(agentsFile)) return path.join('.agents', 'AGENTS.md');
    return '.agents';
  }

  return null;
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const remediationTips: string[] = [];
  let score = 1;

  const workspace = detectWorkspaces(root);

  const readmePath = fileExistsCI(root, README_NAMES);
  const directAgentFile = fileExistsCI(root, AGENT_FILE_NAMES);
  const modernAgentRule = findModernAgentRules(root);
  const archFile = fileExistsCI(root, ARCH_NAMES);

  // Subproject context files
  const subprojectAgentFiles: string[] = [];
  for (const pkg of workspace.packages) {
    const pkgAgent = fileExistsCI(pkg.path, AGENT_FILE_NAMES);
    if (pkgAgent) subprojectAgentFiles.push(path.relative(root, pkgAgent));
  }

  let chosenAgentFile =
    directAgentFile || (modernAgentRule ? path.join(root, modernAgentRule) : null);

  if (!chosenAgentFile && subprojectAgentFiles.length > 0) {
    chosenAgentFile = path.join(root, subprojectAgentFiles[0]);
  }

  if (!readmePath && !chosenAgentFile) {
    evidence.push('No README or agent-specific context file found.');
    remediationTips.push('Create an AGENTS.md file with build, test, and architecture guidelines.');
    return { score: 1, evidence, remediationTips, blocking: false };
  }

  if (readmePath && !chosenAgentFile) {
    score = 2;
    evidence.push(
      `README found (${path.basename(readmePath)}), but no agent instruction file (e.g. AGENTS.md, CLAUDE.md, .cursor/rules).`,
    );
    remediationTips.push(
      'Add an AGENTS.md file to instruct agents on commands, conventions, and test setups.',
    );
  }

  if (chosenAgentFile) {
    score = 3;
    const relAgentFile = path.relative(root, chosenAgentFile);
    evidence.push(`Agent context file found: ${relAgentFile}.`);

    if (
      subprojectAgentFiles.length > 1 ||
      (!directAgentFile && !modernAgentRule && subprojectAgentFiles.length > 0)
    ) {
      evidence.push(
        `Workspace package instruction file(s) detected: ${subprojectAgentFiles.slice(0, 3).join(', ')}.`,
      );
    }

    // Freshness check
    const isGitRepo = git.isGitRepo(root);
    const fileTime = isGitRepo
      ? git.lastCommitTime(root, relAgentFile)
      : git.fileMtime(chosenAgentFile);
    const repoTime = isGitRepo ? git.lastRepoCommitTime(root) : null;

    let isFresh = true;
    if (fileTime && repoTime) {
      const gapDays = (repoTime - fileTime) / 86400;
      if (gapDays < STALE_DAYS_THRESHOLD) {
        score += 1;
        evidence.push(
          `Context file updated recently (${Math.round(gapDays)}d before latest commit).`,
        );
      } else {
        isFresh = false;
        evidence.push(
          `Context file appears stale (${Math.round(gapDays)}d since last touched vs. latest commit) — may not reflect current codebase.`,
        );
        remediationTips.push(
          `Review and update ${relAgentFile} to reflect current codebase status.`,
        );
      }
    }

    // Does it actually contain operational content, or is it a stub?
    try {
      if (fs.statSync(chosenAgentFile).isFile()) {
        const content = fs.readFileSync(chosenAgentFile, 'utf8').toLowerCase();
        const hasCommands = /\b(test|build|lint|typecheck|install|run|compile|dev)\b/.test(content);
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        if (hasCommands && wordCount > 40) {
          if (isFresh) score += 1;
          evidence.push(
            'Context file includes concrete commands (build/test/lint), not just a stub.',
          );
        } else {
          evidence.push('Context file is thin — missing concrete build/test/lint commands.');
          remediationTips.push(
            `Expand ${relAgentFile} with explicit shell commands for install, test, and build.`,
          );
        }
      }
    } catch {
      // ignore read errors
    }

    // Task runner bonus: a Makefile/justfile/turbo.json gives agents a clear, unified entry point
    const taskRunner = TASK_RUNNER_FILES.find((f) => fs.existsSync(path.join(root, f)));
    if (taskRunner) {
      score = Math.min(5, score + 1);
      evidence.push(
        `Task runner / workspace orchestrator found (${taskRunner}) — agents have a clear entry point for common commands.`,
      );
    }

    if (archFile) {
      evidence.push(`Architecture documentation detected: ${path.relative(root, archFile)}.`);
    }
  }

  score = Math.max(1, Math.min(5, score));
  return { score, evidence, remediationTips, blocking: false };
}

export const id = 'context';
export const label = 'Agent context freshness';
export { scan };
