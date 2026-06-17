import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const guardScript = path.join(rootDir, 'scripts/check-db-access-guard.mjs');

export function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

export function runGuard(cwd, args = []) {
  return spawnSync(process.execPath, [guardScript, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

export function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-db-access-'));
}

export function writeFixture(tempRoot, relativePath, lines) {
  const fixturePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, [...lines, ''].join('\n'));
}

export function writeEmptyBaseline(tempRoot) {
  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify({ version: 2, entries: [] }, null, 2)
  );
}

export function readReport(tempRoot) {
  return JSON.parse(
    fs.readFileSync(path.join(tempRoot, 'tmp/db-access-guard/report.json'), 'utf8')
  );
}

export function readBaseline(tempRoot) {
  return JSON.parse(fs.readFileSync(path.join(tempRoot, 'db-access-baseline.json'), 'utf8'));
}

export function runAppGuard(tempRoot, extraArgs = []) {
  return runGuard(tempRoot, [
    '--roots=apps/web/src',
    '--baseline=db-access-baseline.json',
    ...extraArgs,
  ]);
}
