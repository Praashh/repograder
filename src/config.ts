import fs from 'fs';
import path from 'path';

export type OutputFormat = 'text' | 'json' | 'markdown' | 'badge' | 'sarif' | 'codeclimate';

export interface DimensionConfig {
  enabled?: boolean;
  minScore?: number;
  blocking?: boolean;
}

export interface WebhookConfig {
  slack?: string;
  discord?: string;
}

export interface RepograderConfig {
  failUnder?: number;
  format?: OutputFormat;
  ignorePaths?: string[];
  dimensions?: Record<string, DimensionConfig>;
  webhooks?: WebhookConfig;
}

const DEFAULT_CONFIG_FILES = ['repograder.config.json', '.repograderrc.json'];

export function loadConfig(root: string, explicitConfigPath?: string): RepograderConfig {
  // 1. Explicit path
  if (explicitConfigPath) {
    const resolved = path.isAbsolute(explicitConfigPath)
      ? explicitConfigPath
      : path.resolve(root, explicitConfigPath);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error(`Warning: Failed to parse configuration file at "${resolved}":`, err);
        return {};
      }
    }
    console.error(`Warning: Configuration file not found at "${resolved}".`);
    return {};
  }

  // 2. Default config files in root
  for (const filename of DEFAULT_CONFIG_FILES) {
    const fullPath = path.join(root, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error(`Warning: Failed to parse configuration file at "${fullPath}":`, err);
        return {};
      }
    }
  }

  // 3. package.json "repograder" field
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.repograder && typeof pkg.repograder === 'object') {
        return pkg.repograder;
      }
    } catch {
      // ignore
    }
  }

  return {};
}
