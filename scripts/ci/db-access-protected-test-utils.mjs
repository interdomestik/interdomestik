import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { rootDir, writeFixture } from './db-access-guard-test-utils.mjs';
import { runGit } from './db-access-git.mjs';
import { digest } from './db-access-trust.mjs';
import { tsTarball, verifiedCompiler } from './db-access-protected-registry-fixture.mjs';

const LEGACY_BASE = '278e33ab0dd448547fa81d4b0ff122b4d69c901e';
const TS = '5.9.3';
const audit = yaml.load(fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'))
  .jobs.audit;
const step = audit.steps.find(item => item.id === 'protected_db_access');
const ambient = [
  'import { db } from "@interdomestik/database";',
  'export function f() { return db.select().from(user); }',
];
const temporary = new Set();
process.on('exit', () => {
  for (const dir of temporary) {
    const unlock = current => {
      if (fs.lstatSync(current).isSymbolicLink()) return;
      fs.chmodSync(current, fs.statSync(current).isDirectory() ? 0o700 : 0o600);
      if (fs.statSync(current).isDirectory())
        for (const name of fs.readdirSync(current)) unlock(path.join(current, name));
    };
    unlock(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
const tmp = label => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `db-guard-${label}-`)));
  temporary.add(dir);
  return dir;
};
const git = (cwd, ...args) =>
  runGit(
    [
      '-C',
      cwd,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@invalid.test',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { encoding: 'utf8' }
  ).trim();
const commit = (cwd, message) => {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-qm', message, '--allow-empty');
  return git(cwd, 'rev-parse', 'HEAD');
};
const fixtureLock = () => [
  "lockfileVersion: '9.0'",
  '',
  'importers:',
  '',
  '  .:',
  '    devDependencies:',
  '      typescript:',
  '        specifier: ^5.9.3',
  `        version: ${TS}`,
  '',
  'packages:',
  '',
  `  typescript@${TS}:`,
  '    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}',
];

const legacyFiles = git(rootDir, 'ls-tree', '-r', '--name-only', LEGACY_BASE, 'scripts/')
  .split('\n')
  .filter(
    file =>
      file === 'scripts/check-db-access-guard.mjs' ||
      (/^scripts\/ci\/(db-access-[^/]+|source-strip-comments)\.mjs$/u.test(file) &&
        !/test/u.test(file))
  );
function legacyCommand(cwd, args = [], packageScript = false) {
  const modules = path.join(cwd, 'node_modules');
  assert.equal(fs.existsSync(modules), false);
  fs.mkdirSync(modules);
  fs.symlinkSync(verifiedCompiler, path.join(modules, 'typescript'), 'dir');
  try {
    return spawnSync(
      packageScript ? 'pnpm' : process.execPath,
      packageScript ? ['check:db-access', ...args] : ['scripts/check-db-access-guard.mjs', ...args],
      {
        cwd,
        encoding: 'utf8',
      }
    );
  } finally {
    fs.rmSync(modules, { recursive: true, force: true });
  }
}
function legacyOrigin(edit = () => {}) {
  const origin = tmp('origin');
  git(origin, 'init', '-q', '-b', 'main');
  for (const file of legacyFiles)
    writeFixture(origin, file, runGit(['-C', rootDir, 'show', `${LEGACY_BASE}:${file}`]));
  writeFixture(origin, 'pnpm-lock.yaml', fixtureLock(tsTarball));
  writeFixture(origin, 'apps/web/src/old.ts', ambient);
  const seeded = legacyCommand(origin, ['--write-baseline']);
  assert.equal(seeded.status, 0, seeded.stderr);
  edit(origin);
  return { origin, base: commit(origin, 'protected legacy guard') };
}

const epochFiles = [
  'scripts/check-db-access-guard.mjs',
  ...fs
    .readdirSync(path.join(rootDir, 'scripts/ci'))
    .filter(name => /^(db-access-|source-)[^/]*\.mjs$/u.test(name) && !/test/u.test(name))
    .map(name => `scripts/ci/${name}`),
];
function epochOrigin(lock = fixtureLock(tsTarball)) {
  const origin = tmp('origin');
  git(origin, 'init', '-q', '-b', 'main');
  writeFixture(
    origin,
    'package.json',
    JSON.stringify({
      name: 'guard-fixture',
      scripts: { 'check:db-access': 'node scripts/check-db-access-guard.mjs' },
      devDependencies: { typescript: TS },
    })
  );
  writeFixture(
    origin,
    'apps/web/package.json',
    JSON.stringify({ name: '@interdomestik/web', dependencies: { 'drizzle-orm': '1' } })
  );
  writeFixture(
    origin,
    'packages/database/package.json',
    JSON.stringify({ name: '@interdomestik/database', exports: { '.': './src/index.ts' } })
  );
  writeFixture(origin, 'packages/database/src/index.ts', [
    'export { db } from "./db";',
    'export { withTenantContext } from "./tenant";',
  ]);
  writeFixture(origin, 'packages/database/src/db.ts', 'export const db = {} as any;');
  writeFixture(
    origin,
    'packages/database/src/tenant.ts',
    'export async function withTenantContext(c: any, a: any) { return a({}); }'
  );
  writeFixture(
    origin,
    'packages/database/src/rls-role-assertion.ts',
    'export const a = () => true;'
  );
  writeFixture(
    origin,
    'packages/database/src/rls-role-readiness.ts',
    'export const r = () => true;'
  );
  writeFixture(
    origin,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })
  );
  writeFixture(
    origin,
    'scripts/ci/db-access-baseline.json',
    JSON.stringify({ version: 2, entries: [] })
  );
  writeFixture(origin, 'apps/web/src/old.ts', ambient);
  const adoption = commit(origin, 'fixture adoption epoch');
  const critical = ['tenant', 'db', 'rls-role-assertion', 'rls-role-readiness'].map(
    n => `packages/database/src/${n}.ts`
  );
  const files = Object.fromEntries(
    [
      ...critical,
      'scripts/ci/db-access-baseline.json',
      'packages/database/package.json',
      'apps/web/tsconfig.json',
    ].map(file => [file, digest(fs.readFileSync(path.join(origin, file)))])
  );
  for (const file of epochFiles)
    writeFixture(origin, file, fs.readFileSync(path.join(rootDir, file)));
  const tree = git(origin, 'rev-parse', `${adoption}^{tree}`);
  writeFixture(
    origin,
    'scripts/ci/db-access-adoption.mjs',
    `export const ADOPTION = Object.freeze(${JSON.stringify({ commit: adoption, tree, files, critical })});\n`
  );
  writeFixture(origin, 'pnpm-lock.yaml', lock);
  return { origin, base: commit(origin, 'protected epoch guard (post-merge shape)') };
}

function checkout(origin, mutate = () => {}, { depth } = {}) {
  const ws = tmp('ws');
  runGit([
    'clone',
    '-q',
    '--no-local',
    ...(depth ? ['--depth', String(depth)] : []),
    `file://${origin}`,
    ws,
  ]);
  git(ws, 'checkout', '-q', '-b', 'candidate');
  mutate(ws);
  return { ws, head: commit(ws, 'candidate') };
}
function route(ws, event = {}, extraEnv = {}) {
  const temp = tmp('runner-temp');
  const env = {
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
    GITHUB_WORKSPACE: ws,
    RUNNER_TEMP: temp,
    EVENT_NAME: 'pull_request',
    EVENT_SHA: git(ws, 'rev-parse', 'HEAD'),
    CANDIDATE_SHA: git(ws, 'rev-parse', 'HEAD'),
    EVENT_REF: 'refs/pull/1902/merge',
    PUSH_AFTER: '',
    PR_BASE_SHA: event.PR_BASE_SHA ?? git(ws, 'rev-parse', 'origin/main'),
    PR_BASE_REF: 'main',
    DEFAULT_BRANCH: 'main',
    TS_EXPECTED_VERSION: TS,
    DB_GUARD_FIXTURE_TYPESCRIPT_TGZ: tsTarball,
    ...event,
    ...extraEnv,
  };
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', step.run], {
    cwd: ws,
    env,
    encoding: 'utf8',
    timeout: 180000,
  });
  const work = fs.readdirSync(temp).find(name => name.startsWith('db-guard-protected.'));
  const file = [
    work && path.join(temp, work, 'out/report.json'),
    path.join(ws, 'tmp/db-access-guard/protected-base.json'),
  ].find(candidate => candidate && fs.existsSync(candidate));
  return { ...result, report: file && JSON.parse(fs.readFileSync(file, 'utf8')) };
}
const sentinelModule = sentinel =>
  `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(sentinel)}, 'loaded'); process.exit(0);\n`;

export {
  LEGACY_BASE,
  TS,
  audit,
  step,
  ambient,
  tmp,
  git,
  commit,
  fixtureLock,
  legacyFiles,
  legacyOrigin,
  legacyCommand,
  epochOrigin,
  checkout,
  route,
  sentinelModule,
  tsTarball,
};
