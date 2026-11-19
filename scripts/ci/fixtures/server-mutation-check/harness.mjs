// Fixture harness of the server-mutation contract tests: builds throwaway source trees and git
// repositories in the OS temp directory. It never reads the real tree's findings.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createParser, listSourceFiles, scanRoots } from '../../server-mutation/ast.mjs';
import { CHECKS } from '../../server-mutation/evaluate.mjs';
import { parseRegistry } from '../../server-mutation/registry.mjs';

export const FIXTURES = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(FIXTURES, '../../../..');
export const SCANNER = path.join(REPO_ROOT, 'scripts/ci/server-mutation-check.mjs');
export const check = id => CHECKS.find(candidate => candidate.id === id);

// The minimum every tree needs: the wrapper module, the refusal codes and one schema reference.
export const BASE_FILES = Object.freeze({
  'apps/web/src/lib/safe-action.ts':
    'export const defineAction = (d: unknown) => d;\nexport const defineFormAction = defineAction;\n',
  'apps/web/src/lib/safe-action.types.ts':
    "export const REFUSAL_CODES = Object.freeze([\n  'UNAUTHORIZED',\n  'FORBIDDEN',\n  'FORBIDDEN_SCOPE_MISMATCH',\n]);\n",
  'packages/database/src/schema/core.ts':
    "export const things = pgTable('things', {\n  ownerId: text('owner_id').references(() => user.id),\n});\n",
});

export function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    if (text === null) {
      fs.rmSync(abs, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  return root;
}

export function tempDir(t, prefix = 'smc-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Files of a snapshot case (`<case>/<repo path>.fixture`), keyed by repo path.
export function fixtureCase(name) {
  const dir = path.join(FIXTURES, name);
  const out = {};
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.fixture'))
        out[child.slice(0, -'.fixture'.length)] = fs.readFileSync(path.join(dir, child), 'utf8');
    }
  };
  walk('');
  return out;
}

export function tree(t, files) {
  return writeTree(tempDir(t), { ...BASE_FILES, ...files });
}

export function registryOf(entries) {
  return { version: 1, entries };
}

export function runCheck(id, root, registry = registryOf([])) {
  const ctx = {
    root,
    files: listSourceFiles(root, scanRoots(root)),
    parse: createParser(root),
    registry,
  };
  return check(id).run(ctx);
}

export const ids = result => result.findings.map(finding => finding.id);

export function baselineOf(overrides = {}) {
  const checks = {};
  for (const { id } of CHECKS)
    checks[id] = {
      mode: 'report',
      unit: 'u',
      predicate: 'p',
      coverageMin: 0,
      exhausted: true,
      items: [],
    };
  for (const [id, value] of Object.entries(overrides)) checks[id] = { ...checks[id], ...value };
  return { version: 1, takenAt: 'fixture', checks, exceptions: [] };
}

export const json = value => `${JSON.stringify(value, null, 2)}\n`;
export const validRegistry = () =>
  parseRegistry(json(registryOf([pageEntry('page-home', 'apps/web/src/app/page.tsx')])));

export function pageEntry(id, page) {
  return { id, kind: 'page', page, writes: false, closedBy: null, source: 'fixture' };
}

export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

export function initRepo(root) {
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'fixture');
  git(root, 'config', 'commit.gpgsign', 'false');
  return root;
}

export function commit(root, files, message = 'fixture') {
  writeTree(root, files);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

// Runs the real CLI; returns { code, report, stdout }.
export function runCli(cwd, args, scanner = SCANNER) {
  const report = path.join(cwd, '.report.json');
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync(process.execPath, [scanner, ...args, '--report', report], {
      cwd,
      encoding: 'utf8',
    });
  } catch (error) {
    code = error.status;
    stdout = String(error.stdout ?? '');
  }
  const body = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
  fs.rmSync(report, { force: true });
  return { code, report: body, stdout };
}
