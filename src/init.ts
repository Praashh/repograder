import fs from 'fs';
import path from 'path';

export interface InitOptions {
  force?: boolean;
}

export function initAgentsMd(
  targetDir: string,
  options: InitOptions = {},
): { success: boolean; message: string } {
  const filePath = path.join(targetDir, 'AGENTS.md');
  if (fs.existsSync(filePath) && !options.force) {
    return {
      success: false,
      message: 'AGENTS.md already exists. Use --force to overwrite.',
    };
  }

  const sections: string[] = [];
  sections.push('# AGENTS.md');
  sections.push('');
  sections.push('## Overview');

  // Detect project name & stack
  let projectName = path.basename(path.resolve(targetDir));
  const buildCommands: string[] = [];
  const testCommands: string[] = [];
  const lintCommands: string[] = [];

  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) projectName = pkg.name;
      if (pkg.scripts) {
        if (pkg.scripts.install) buildCommands.push(`npm install`);
        if (pkg.scripts.build) buildCommands.push(`npm run build`);
        if (pkg.scripts.test) testCommands.push(`npm test`);
        if (pkg.scripts.lint) lintCommands.push(`npm run lint`);
        if (pkg.scripts.dev) buildCommands.push(`npm run dev (development mode)`);
      }
    } catch {
      // ignore
    }
  }

  const cargoPath = path.join(targetDir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    buildCommands.push('cargo build');
    testCommands.push('cargo test');
    lintCommands.push('cargo clippy');
  }

  const pyprojectPath = path.join(targetDir, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    testCommands.push('pytest');
    lintCommands.push('ruff check .');
  }

  const goModPath = path.join(targetDir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    buildCommands.push('go build ./...');
    testCommands.push('go test ./...');
  }

  const makefilePath = path.join(targetDir, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    buildCommands.push('make build');
    testCommands.push('make test');
  }

  sections.push(
    `Repository instructions and operational context for AI coding agents working on ${projectName}.`,
  );
  sections.push('');
  sections.push('## Build & Test');
  if (buildCommands.length > 0) {
    buildCommands.forEach((cmd) => sections.push(`- Build: \`${cmd}\``));
  } else {
    sections.push('- Build: *(specify build command here)*');
  }

  if (testCommands.length > 0) {
    testCommands.forEach((cmd) => sections.push(`- Test: \`${cmd}\``));
  } else {
    sections.push('- Test: *(specify test command here)*');
  }

  if (lintCommands.length > 0) {
    lintCommands.forEach((cmd) => sections.push(`- Lint: \`${cmd}\``));
  }

  sections.push('');
  sections.push('## Code Style & Conventions');
  sections.push('- Keep functions and modules focused and concise (<300 lines).');
  sections.push('- Prefer deterministic, pure functions where feasible.');
  sections.push('- Write descriptive unit tests for all new behavior before opening PRs.');
  sections.push('- Do not commit secrets or raw environment variables.');
  sections.push('');
  sections.push('## Agent Guidance');
  sections.push('1. Always run the test suite and verify changes pass before submitting.');
  sections.push(
    '2. When editing code, preserve existing comments and documentation unless instructed otherwise.',
  );
  sections.push(
    '3. Check for compiler and linter diagnostics before running full integration suites.',
  );
  sections.push('');

  try {
    fs.writeFileSync(filePath, sections.join('\n'), 'utf8');
    return {
      success: true,
      message: `Successfully scaffolded ${filePath}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to create AGENTS.md: ${err.message}`,
    };
  }
}
