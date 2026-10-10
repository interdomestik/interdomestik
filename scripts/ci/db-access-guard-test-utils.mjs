import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './db-access-trust.mjs';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = path.join(rootDir, 'scripts/ci/db-access-guard-test-harness.mjs');
const temporary = new Set();
process.on('exit', () => {
  for (const root of temporary) fs.rmSync(root, { recursive: true, force: true });
});
export const readText = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
export function writeFixture(root, file, lines) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Array.isArray(lines) ? lines.join('\n') + '\n' : lines);
}
export function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-db-access-'));
  temporary.add(root);
  execFileSync('git', ['init', '-q', root]);
  writeFixture(
    root,
    'apps/web/package.json',
    JSON.stringify({
      name: '@interdomestik/web',
      dependencies: {
        'external-library': '1',
        'drizzle-orm': '1',
        'next-intl': '1',
        react: '1',
        next: '1',
      },
    })
  );
  writeFixture(
    root,
    'packages/database/package.json',
    JSON.stringify({
      name: '@interdomestik/database',
      exports: { '.': './src/index.ts', './db': './src/db.ts', './tenant': './src/tenant.ts' },
    })
  );
  writeFixture(root, 'packages/database/src/index.ts', [
    'export { db, dbAdmin, dbRls } from "./db";',
    'export { withTenantContext, withTenantDb } from "./tenant";',
    'export const claims = {};',
  ]);
  writeFixture(root, 'packages/database/src/db.ts', [
    'export const db = {} as any;',
    'export const dbRls = {} as any;',
    'export const dbAdmin = {} as any;',
  ]);
  writeFixture(root, 'packages/database/src/tenant.ts', [
    'export async function withTenantContext(context: any, action: any) { return action({}); }',
    'export const withTenantDb = withTenantContext;',
  ]);
  writeFixture(
    root,
    'packages/database/src/rls-role-assertion.ts',
    'export const assertRole = () => true;'
  );
  writeFixture(
    root,
    'packages/database/src/rls-role-readiness.ts',
    'export const readiness = () => true;'
  );
  writeFixture(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } })
  );
  writeFixture(
    root,
    'scripts/ci/db-access-baseline.json',
    JSON.stringify({ version: 2, entries: [] })
  );
  sealFixture(root);
  return root;
}
export function sealFixture(root) {
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=Guard fixture',
    '-c',
    'user.email=fixture@invalid.test',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'trusted fixture',
    '--allow-empty',
  ]);
  const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const critical = ['tenant', 'db', 'rls-role-assertion', 'rls-role-readiness'].map(
    file => `packages/database/src/${file}.ts`
  );
  const files = {};
  for (const file of [
    ...critical,
    'scripts/ci/db-access-baseline.json',
    'packages/database/package.json',
    'apps/web/tsconfig.json',
  ])
    files[file] = digest(fs.readFileSync(path.join(root, file)));
  writeFixture(
    root,
    '.fixture-adoption.json',
    JSON.stringify({
      commit: git(['rev-parse', 'HEAD']),
      tree: git(['rev-parse', 'HEAD^{tree}']),
      files,
      critical,
    })
  );
}
export function runGuard(root, args = []) {
  return spawnSync(process.execPath, [harness, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}
export const readReport = root =>
  JSON.parse(fs.readFileSync(path.join(root, 'tmp/db-access-guard/report.json'), 'utf8'));
export function scan(lines, file = 'apps/web/src/example.ts') {
  const root = createTempRepo();
  writeFixture(root, file, lines);
  return { root, result: runGuard(root), report: readReport(root) };
}
