import fs from 'fs';
import path from 'path';
import type { ScanResult } from '../types';
import { detectWorkspaces } from '../lib/workspace';

interface EcosystemEnvironment {
  name: string;
  manifests: string[];
  versionFiles: string[];
  checkManifestForVersion?: (content: string) => string | null;
}

const ECOSYSTEM_ENVS: EcosystemEnvironment[] = [
  {
    name: 'Node',
    manifests: ['package.json'],
    versionFiles: ['.nvmrc', '.node-version'],
    checkManifestForVersion: (content: string) => {
      try {
        const pkg = JSON.parse(content);
        if (pkg.engines && pkg.engines.node) {
          return `engines.node: "${pkg.engines.node}"`;
        }
      } catch {
        // ignore invalid json
      }
      return null;
    },
  },
  {
    name: 'Python',
    manifests: ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py'],
    versionFiles: ['.python-version', 'runtime.txt'],
    checkManifestForVersion: (content: string) => {
      if (content.includes('requires-python') || content.includes('python_version')) {
        return 'python version constraint specified in manifest';
      }
      return null;
    },
  },
  {
    name: 'Rust',
    manifests: ['Cargo.toml'],
    versionFiles: ['rust-toolchain.toml', 'rust-toolchain'],
    checkManifestForVersion: (content: string) => {
      if (content.includes('rust-version')) {
        return 'rust-version specified in Cargo.toml';
      }
      return null;
    },
  },
  {
    name: 'Go',
    manifests: ['go.mod'],
    versionFiles: ['.go-version'],
    checkManifestForVersion: (content: string) => {
      const match = content.match(/^go\s+(\d+(?:\.\d+)*)/m);
      if (match) {
        return `go ${match[1]} specified in go.mod`;
      }
      return null;
    },
  },
  {
    name: 'Ruby',
    manifests: ['Gemfile'],
    versionFiles: ['.ruby-version'],
    checkManifestForVersion: (content: string) => {
      if (/^\s*ruby\s+['"][^'"]+['"]/m.test(content)) {
        return 'ruby version specified in Gemfile';
      }
      return null;
    },
  },
  {
    name: 'Java',
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    versionFiles: ['.sdkmanrc', '.java-version'],
    checkManifestForVersion: (content: string) => {
      if (
        content.includes('sourceCompatibility') ||
        content.includes('targetCompatibility') ||
        content.includes('<java.version>') ||
        content.includes('<maven.compiler.source>')
      ) {
        return 'java version specified in build configuration';
      }
      return null;
    },
  },
];

const CONTAINER_FILES = [
  '.devcontainer/devcontainer.json',
  '.devcontainer.json',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yaml',
  'compose.yml',
  'shell.nix',
  'default.nix',
  'flake.nix',
  '.envrc',
  'Vagrantfile',
];

function fileExists(dir: string, file: string): boolean {
  try {
    return fs.existsSync(path.join(dir, file));
  } catch {
    return false;
  }
}

function scan(root: string): ScanResult {
  const evidence: string[] = [];
  const remediationTips: string[] = [];

  try {
    const workspace = detectWorkspaces(root);
    const searchDirs = [root, ...workspace.packages.map((p) => p.path)];

    // 1. Detect active ecosystems
    const detectedEcosystems: {
      name: string;
      isPinned: boolean;
      detail: string | null;
    }[] = [];

    for (const eco of ECOSYSTEM_ENVS) {
      let isEcosystemActive = false;
      let isPinned = false;
      let detail: string | null = null;

      for (const dir of searchDirs) {
        for (const m of eco.manifests) {
          if (fileExists(dir, m)) {
            isEcosystemActive = true;
            if (eco.checkManifestForVersion) {
              try {
                const content = fs.readFileSync(path.join(dir, m), 'utf8');
                const ver = eco.checkManifestForVersion(content);
                if (ver) {
                  isPinned = true;
                  detail = ver;
                  break;
                }
              } catch {
                // ignore
              }
            }
          }
        }
        if (isPinned) break;

        for (const vf of eco.versionFiles) {
          if (fileExists(dir, vf)) {
            isEcosystemActive = true;
            isPinned = true;
            try {
              const content = fs.readFileSync(path.join(dir, vf), 'utf8').trim();
              detail = `${vf} (${content.slice(0, 30)})`;
            } catch {
              detail = vf;
            }
            break;
          }
        }
        if (isPinned) break;
      }

      if (isEcosystemActive) {
        detectedEcosystems.push({ name: eco.name, isPinned, detail });
      }
    }

    // 2. Check for containerized or dev environment configurations
    const detectedContainers: string[] = [];
    for (const cf of CONTAINER_FILES) {
      if (fileExists(root, cf)) {
        detectedContainers.push(cf);
      }
    }
    // Also check .devcontainer folder if it has any json
    const devcontainerDir = path.join(root, '.devcontainer');
    if (fs.existsSync(devcontainerDir)) {
      try {
        const files = fs.readdirSync(devcontainerDir);
        if (files.some((f) => f.endsWith('.json') || f.includes('Dockerfile'))) {
          if (!detectedContainers.includes('.devcontainer/devcontainer.json')) {
            detectedContainers.push('.devcontainer/');
          }
        }
      } catch {
        // ignore
      }
    }

    if (detectedEcosystems.length === 0 && detectedContainers.length === 0) {
      evidence.push('No recognized project manifests or environment configs found.');
      return { score: 3, evidence, remediationTips, blocking: false };
    }

    // Report detected ecosystems
    let pinnedCount = 0;
    for (const eco of detectedEcosystems) {
      if (eco.isPinned) {
        pinnedCount++;
        evidence.push(`${eco.name}: runtime version pinned via ${eco.detail}.`);
      } else {
        evidence.push(
          `${eco.name}: manifest present, but runtime version is NOT explicitly pinned.`,
        );
        if (eco.name === 'Node') {
          remediationTips.push(
            'Add .nvmrc or specify "engines.node" in package.json to pin the Node.js runtime.',
          );
        } else if (eco.name === 'Python') {
          remediationTips.push('Add .python-version or specify requires-python in pyproject.toml.');
        } else if (eco.name === 'Rust') {
          remediationTips.push('Add rust-toolchain.toml or specify rust-version in Cargo.toml.');
        } else if (eco.name === 'Go') {
          remediationTips.push('Specify go version directive in go.mod or add .go-version.');
        } else {
          remediationTips.push(
            `Pin the ${eco.name} runtime version via .${eco.name.toLowerCase()}-version file.`,
          );
        }
      }
    }

    // Report containers/environments
    if (detectedContainers.length > 0) {
      evidence.push(`Container / dev environment found: ${detectedContainers.join(', ')}.`);
    } else {
      remediationTips.push(
        'Add a .devcontainer/devcontainer.json or Dockerfile for reproducible agent environments.',
      );
    }

    // 3. Compute score
    const allPinned = detectedEcosystems.length > 0 && pinnedCount === detectedEcosystems.length;
    const hasContainer = detectedContainers.length > 0;

    let score = 3;
    if (allPinned && hasContainer) {
      score = 5;
    } else if (allPinned || hasContainer) {
      score = 4;
    } else if (pinnedCount > 0) {
      score = 3;
    } else if (detectedEcosystems.length > 0) {
      score = 2;
    }

    return {
      score,
      evidence,
      remediationTips,
      blocking: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      score: 3,
      evidence: [`Environment scanner failed gracefully: ${msg}`],
      remediationTips: [],
      blocking: false,
    };
  }
}

export const id = 'environment';
export const label = 'Local environment reproducibility';
export { scan };
