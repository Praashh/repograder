import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { c } from './ui/colors';
import { renderBox } from './ui/box';
import { initAgentsMd } from './init';

export interface RuleTargetDef {
  id: string;
  name: string;
  relativePath: string;
  format: 'markdown' | 'mdc' | 'plain';
  description: string;
}

export const RULE_TARGETS: RuleTargetDef[] = [
  {
    id: 'agents',
    name: 'AGENTS Standard',
    relativePath: 'AGENTS.md',
    format: 'markdown',
    description: 'Canonical open instruction standard for autonomous AI agents',
  },
  {
    id: 'cursor',
    name: 'Cursor Rules',
    relativePath: path.join('.cursor', 'rules', 'agent-instructions.mdc'),
    format: 'mdc',
    description: 'Cursor IDE MDC rules format with globs and auto-apply frontmatter',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    relativePath: path.join('.claude', 'CLAUDE.md'),
    format: 'markdown',
    description: 'Anthropic Claude Code CLI context guide',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    relativePath: path.join('.github', 'copilot-instructions.md'),
    format: 'markdown',
    description: 'GitHub Copilot Agent Mode custom repository instructions',
  },
  {
    id: 'windsurf',
    name: 'Windsurf Rules',
    relativePath: '.windsurfrules',
    format: 'plain',
    description: 'Codeium Windsurf cascade context rules file',
  },
];

export interface RuleTargetStatus extends RuleTargetDef {
  exists: boolean;
  absolutePath: string;
  byteSize: number;
  lastModified?: Date;
  syncedWithPrimary?: boolean;
  hasSyncTag?: boolean;
}

export interface RulesCheckResult {
  primaryFile: string | null;
  primaryHash: string | null;
  targets: RuleTargetStatus[];
  inSync: boolean;
  missingTargets: string[];
  outOfSyncTargets: string[];
  summary: string;
}

export interface RuleSyncAction {
  targetId: string;
  name: string;
  file: string;
  action: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
}

export interface RulesSyncResult {
  primaryFile: string;
  actions: RuleSyncAction[];
  summary: string;
}

export interface SyncRulesOptions {
  dryRun?: boolean;
  force?: boolean;
  targets?: string[]; // IDs to sync, e.g. ['cursor', 'claude']
}

export function computeContentHash(content: string): string {
  // Strip out any sync tag lines when hashing content
  const normalized = content
    .replace(/<!--\s*repograder:synced-from=[^>]+-->/g, '')
    .replace(/^#\s*repograder:synced-from=.*$/gm, '')
    .trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
}

export function findPrimaryContextFile(root: string): string | null {
  const candidates = [
    path.join(root, 'AGENTS.md'),
    path.join(root, '.agents', 'AGENTS.md'),
    path.join(root, 'CLAUDE.md'),
    path.join(root, '.claude', 'CLAUDE.md'),
    path.join(root, '.github', 'copilot-instructions.md'),
    path.join(root, '.cursorrules'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export function checkRules(root: string): RulesCheckResult {
  const primaryPath = findPrimaryContextFile(root);
  let primaryHash: string | null = null;

  if (primaryPath && fs.existsSync(primaryPath)) {
    try {
      const content = fs.readFileSync(primaryPath, 'utf8');
      primaryHash = computeContentHash(content);
    } catch {
      // ignore
    }
  }

  const targets: RuleTargetStatus[] = [];
  const missingTargets: string[] = [];
  const outOfSyncTargets: string[] = [];

  for (const def of RULE_TARGETS) {
    const absPath = path.join(root, def.relativePath);
    const exists = fs.existsSync(absPath);
    let byteSize = 0;
    let lastModified: Date | undefined;
    let syncedWithPrimary = false;
    let hasSyncTag = false;

    if (exists) {
      try {
        const stat = fs.statSync(absPath);
        byteSize = stat.size;
        lastModified = stat.mtime;

        const content = fs.readFileSync(absPath, 'utf8');
        const match = content.match(/repograder:synced-from=[^:\s]+:sha=([a-f0-9]{12})/i);
        if (match) {
          hasSyncTag = true;
          if (primaryHash && match[1] === primaryHash) {
            syncedWithPrimary = true;
          } else {
            outOfSyncTargets.push(def.id);
          }
        } else if (absPath === primaryPath) {
          syncedWithPrimary = true;
        } else {
          // Exists but no repograder sync tag: independently managed or unlinked
          outOfSyncTargets.push(def.id);
        }
      } catch {
        // ignore
      }
    } else {
      missingTargets.push(def.id);
    }

    targets.push({
      ...def,
      exists,
      absolutePath: absPath,
      byteSize,
      lastModified,
      syncedWithPrimary,
      hasSyncTag,
    });
  }

  const inSync =
    Boolean(primaryPath) && missingTargets.length === 0 && outOfSyncTargets.length === 0;

  let summary: string;
  if (!primaryPath) {
    summary = 'No canonical agent instructions found. Run repograder rules sync to initialize.';
  } else if (inSync) {
    summary = 'All 5 agent instruction rules are present and synchronized.';
  } else {
    const parts: string[] = [];
    if (missingTargets.length > 0) parts.push(`${missingTargets.length} missing`);
    if (outOfSyncTargets.length > 0) parts.push(`${outOfSyncTargets.length} out of sync`);
    summary = `Rules drift detected: ${parts.join(', ')}. Run repograder rules sync to harmonize.`;
  }

  return {
    primaryFile: primaryPath ? path.relative(root, primaryPath) : null,
    primaryHash,
    targets,
    inSync,
    missingTargets,
    outOfSyncTargets,
    summary,
  };
}

export function generateTargetContent(
  targetId: string,
  primaryContent: string,
  primaryHash: string,
): string {
  // Strip any old sync tags or markdown headers that collide
  const cleanedContent = primaryContent
    .replace(/<!--\s*repograder:synced-from=[^>]+-->\n?/g, '')
    .replace(/^#\s*repograder:synced-from=.*\n?/gm, '')
    .trim();

  const syncTag = `<!-- repograder:synced-from=AGENTS.md:sha=${primaryHash} -->`;

  switch (targetId) {
    case 'cursor':
      return [
        '---',
        'description: Repository development conventions, commands, and rules for AI coding agents',
        'globs: *',
        'alwaysApply: true',
        '---',
        syncTag,
        '',
        cleanedContent,
        '',
      ].join('\n');

    case 'claude':
      return [
        syncTag,
        '# CLAUDE.md',
        '> Operational guide for Anthropic Claude Code CLI.',
        '',
        cleanedContent,
        '',
      ].join('\n');

    case 'copilot':
      return [
        syncTag,
        '# GitHub Copilot Instructions',
        '> Repository rules for GitHub Copilot Agent Mode.',
        '',
        cleanedContent,
        '',
      ].join('\n');

    case 'windsurf':
      return [
        `# repograder:synced-from=AGENTS.md:sha=${primaryHash}`,
        '# Windsurf Cascade Rules',
        '',
        cleanedContent,
        '',
      ].join('\n');

    case 'agents':
    default:
      return `${syncTag}\n${cleanedContent}\n`;
  }
}

export function syncRules(root: string, options: SyncRulesOptions = {}): RulesSyncResult {
  const dryRun = Boolean(options.dryRun);
  let primaryPath = findPrimaryContextFile(root);

  // If no primary context file exists, scaffold AGENTS.md first
  if (!primaryPath) {
    const agentsFile = path.join(root, 'AGENTS.md');
    if (!dryRun) {
      initAgentsMd(root);
    }
    primaryPath = agentsFile;
  }

  let primaryContent: string;
  if (fs.existsSync(primaryPath)) {
    try {
      primaryContent = fs.readFileSync(primaryPath, 'utf8');
    } catch {
      primaryContent = '# AGENTS.md\n\n## Overview\nRepository instructions for AI agents.\n';
    }
  } else {
    primaryContent = '# AGENTS.md\n\n## Overview\nRepository instructions for AI agents.\n';
  }

  const primaryHash = computeContentHash(primaryContent);
  const actions: RuleSyncAction[] = [];
  const selectedTargets = options.targets
    ? RULE_TARGETS.filter((t) => options.targets!.includes(t.id))
    : RULE_TARGETS;

  for (const def of selectedTargets) {
    const absPath = path.join(root, def.relativePath);
    const exists = fs.existsSync(absPath);

    // If target is AGENTS.md and it's already the primary file, mark unchanged
    if (def.id === 'agents' && exists && absPath === primaryPath && !options.force) {
      actions.push({
        targetId: def.id,
        name: def.name,
        file: def.relativePath,
        action: 'unchanged',
        reason: 'Canonical source file',
      });
      continue;
    }

    const generated = generateTargetContent(def.id, primaryContent, primaryHash);

    if (exists) {
      try {
        const existingContent = fs.readFileSync(absPath, 'utf8');
        if (existingContent.trim() === generated.trim() && !options.force) {
          actions.push({
            targetId: def.id,
            name: def.name,
            file: def.relativePath,
            action: 'unchanged',
            reason: 'Already in sync with primary',
          });
          continue;
        }
      } catch {
        // proceed to update
      }
    }

    if (!dryRun) {
      const parentDir = path.dirname(absPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(absPath, generated, 'utf8');
    }

    actions.push({
      targetId: def.id,
      name: def.name,
      file: def.relativePath,
      action: exists ? 'updated' : 'created',
    });
  }

  const createdCount = actions.filter((a) => a.action === 'created').length;
  const updatedCount = actions.filter((a) => a.action === 'updated').length;
  const unchangedCount = actions.filter((a) => a.action === 'unchanged').length;

  const summary = dryRun
    ? `Dry-run preview: would create ${createdCount}, update ${updatedCount}, ${unchangedCount} unchanged.`
    : `Synchronized ${createdCount + updatedCount} rule files (${createdCount} created, ${updatedCount} updated, ${unchangedCount} unchanged).`;

  return {
    primaryFile: path.relative(root, primaryPath),
    actions,
    summary,
  };
}

export function renderRulesCheckTerminal(result: RulesCheckResult): string {
  const lines: string[] = [''];
  const title = c.bold(c.cyan(' 📋 MULTI-AGENT RULES HARMONY '));

  lines.push(`  ${c.dim('Canonical Source:')} ${c.bold(result.primaryFile || 'None detected')}`);
  lines.push(
    `  ${c.dim('Status:')}           ${result.inSync ? c.brightGreen('✔ All in sync') : c.yellow('⚠ Discrepancies detected')}`,
  );
  lines.push('');

  for (const t of result.targets) {
    if (!t.exists) {
      lines.push(
        `  ${c.red('✖ missing')}    ${c.bold(t.name.padEnd(16))} ${c.dim(t.relativePath)}`,
      );
    } else if (t.syncedWithPrimary) {
      lines.push(
        `  ${c.brightGreen('✔ synced ')}    ${c.bold(t.name.padEnd(16))} ${c.dim(t.relativePath)} (${t.byteSize} B)`,
      );
    } else {
      lines.push(
        `  ${c.yellow('⚠ out-of-date')} ${c.bold(t.name.padEnd(16))} ${c.dim(t.relativePath)} (drifted)`,
      );
    }
  }

  lines.push('');
  lines.push(`  ${c.dim('Summary:')} ${c.bold(result.summary)}`);
  lines.push('');

  return renderBox(lines, {
    title,
    borderColor: result.inSync ? c.green : c.yellow,
    style: 'rounded',
  });
}

export function renderRulesSyncTerminal(result: RulesSyncResult, dryRun = false): string {
  const lines: string[] = [''];
  const title = dryRun
    ? c.bold(c.yellow(' 🔍 RULES SYNC (DRY-RUN) '))
    : c.bold(c.brightGreen(' 🚀 MULTI-AGENT RULES SYNC '));

  lines.push(`  ${c.dim('Canonical Source:')} ${c.bold(result.primaryFile)}`);
  lines.push('');

  for (const act of result.actions) {
    let icon = c.brightGreen('✔');
    let label = c.brightGreen('created  ');
    if (act.action === 'updated') {
      label = c.cyan('updated  ');
      icon = c.cyan('↻');
    } else if (act.action === 'unchanged') {
      label = c.dim('unchanged');
      icon = c.dim('–');
    } else if (act.action === 'skipped') {
      label = c.yellow('skipped  ');
      icon = c.yellow('⚠');
    }

    if (dryRun && act.action !== 'unchanged') {
      label = c.yellow(`would ${act.action.slice(0, -1)}`);
      icon = c.yellow('🔍');
    }

    lines.push(`  ${icon} ${label}  ${c.bold(act.file.padEnd(36))} ${c.dim(act.reason || '')}`);
  }

  lines.push('');
  lines.push(`  ${c.dim('Summary:')} ${c.bold(result.summary)}`);
  lines.push('');

  return renderBox(lines, {
    title,
    borderColor: dryRun ? c.yellow : c.green,
    style: 'rounded',
  });
}
