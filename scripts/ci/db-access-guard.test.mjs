import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const guardScript = path.join(rootDir, 'scripts/check-db-access-guard.mjs');

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function runGuard(cwd, args = []) {
  return spawnSync(process.execPath, [guardScript, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-db-access-'));
}

function writeFixture(tempRoot, relativePath, lines) {
  const fixturePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, [...lines, ''].join('\n'));
}

function writeEmptyBaseline(tempRoot) {
  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify({ version: 1, entries: [] }, null, 2)
  );
}

function runAppGuard(tempRoot, extraArgs = []) {
  return runGuard(tempRoot, [
    '--roots=apps/web/src',
    '--baseline=db-access-baseline.json',
    ...extraArgs,
  ]);
}

test('db access guard is wired into PR verification and full local checks', () => {
  const packageJson = JSON.parse(readText('package.json'));
  const baseline = JSON.parse(readText('scripts/ci/db-access-baseline.json'));

  assert.equal(packageJson.scripts['check:db-access'], 'node scripts/check-db-access-guard.mjs');
  assert.match(packageJson.scripts['check:all'], /pnpm check:db-access/);
  assert.match(packageJson.scripts['pr:verify'], /pnpm check:db-access/);
  assert.equal(baseline.version, 1);
  assert.ok(Array.isArray(baseline.entries));
  assert.ok(baseline.entries.length > 0);
});

test('db access guard fails only when direct db access is added beyond the baseline', () => {
  const tempRoot = createTempRepo();

  writeFixture(tempRoot, 'apps/web/src/features/example/existing.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function existing() {',
    '  return db.query.user.findFirst({ where: () => true });',
    '}',
  ]);

  const baselineResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);

  writeFixture(tempRoot, 'apps/web/src/features/example/new.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function newlyAdded() {',
    '  return db.select().from(user);',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /new direct db\.\* calls/u);
  assert.match(failingResult.stdout, /new\.ts:3 select/u);
});

test('db access guard requires explicit classification for risky baseline entries', () => {
  const tempRoot = createTempRepo();
  const actionFixturePath = 'apps/web/src/features/example/actions.ts';
  const routeFixturePath = 'apps/web/src/app/api/example/route.ts';
  const actionBaselineEntry = {
    file: actionFixturePath,
    line: 3,
    method: 'query',
    risk: 'server-action',
    source: 'return db.query.user.findFirst({});',
  };
  const routeBaselineEntry = {
    file: routeFixturePath,
    line: 3,
    method: 'select',
    risk: 'high-risk-route',
    source: 'return db.select().from(user);',
  };

  writeFixture(tempRoot, actionFixturePath, [
    "import { db } from '@interdomestik/database';",
    'export async function action() {',
    '  return db.query.user.findFirst({});',
    '}',
  ]);
  writeFixture(tempRoot, routeFixturePath, [
    "import { db } from '@interdomestik/database';",
    'export async function GET() {',
    '  return db.select().from(user);',
    '}',
  ]);
  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify({ version: 1, entries: [actionBaselineEntry, routeBaselineEntry] }, null, 2)
  );

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /require explicit classification/u);
  assert.match(failingResult.stderr, /server-action\/high-risk-route/u);

  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify(
      {
        version: 1,
        entries: [
          {
            ...actionBaselineEntry,
            classification: 'negative-authorization-test-covered',
          },
          {
            ...routeBaselineEntry,
            classification: 'negative-authorization-test-covered',
          },
        ],
      },
      null,
      2
    )
  );

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
});

test('db access guard requires classification for extracted boundary wrappers', () => {
  const tempRoot = createTempRepo();
  const fixturePath = 'apps/web/src/features/agent/activation/server/activate-agent-profile.ts';
  const baselineEntry = {
    file: fixturePath,
    line: 3,
    method: 'update',
    risk: 'app-layer',
    source: 'return db.update(user);',
  };

  writeFixture(tempRoot, fixturePath, [
    "import { db } from '@interdomestik/database';",
    'export async function activate() {',
    '  return db.update(user);',
    '}',
  ]);
  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify({ version: 1, entries: [baselineEntry] }, null, 2)
  );

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /require explicit classification/u);
  assert.match(failingResult.stderr, /extracted boundary wrapper paths/u);

  fs.writeFileSync(
    path.join(tempRoot, 'db-access-baseline.json'),
    JSON.stringify(
      {
        version: 1,
        entries: [
          {
            ...baselineEntry,
            classification: 'extracted-server-action-wrapper: tenant and role scoped helper',
          },
        ],
      },
      null,
      2
    )
  );

  const writeResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(writeResult.status, 0, writeResult.stderr);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
});

test('db access guard catches multiline chains and new domain-package direct access', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/multiline.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function multiline() {',
    '  return db',
    '    .select()',
    '    .from(user);',
    '}',
  ]);
  writeFixture(tempRoot, 'packages/domain-example/src/unsafe-wrapper.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function unsafeDomainWrapper() {',
    '  return db.query.user.findMany({});',
    '}',
  ]);

  const failingResult = runGuard(tempRoot, [
    '--roots=apps/web/src,packages',
    '--baseline=db-access-baseline.json',
  ]);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /multiline\.ts:3 select/u);
  assert.match(failingResult.stdout, /unsafe-wrapper\.ts:3 query \[domain-wrapper\]/u);
});

test('db access guard catches new transaction callback alias writes', () => {
  const tempRoot = createTempRepo();

  writeFixture(tempRoot, 'apps/web/src/features/example/existing.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function existing() {',
    '  return db.transaction(async tx => {',
    '    return tx.insert(existingTable).values({ id: "existing" });',
    '  });',
    '}',
  ]);

  const baselineResult = runAppGuard(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);

  writeFixture(tempRoot, 'apps/web/src/features/example/new-transaction.ts', [
    "import { db } from '@interdomestik/database';",
    'export async function newlyAdded() {',
    '  return db.transaction(async tx => {',
    '    await tx.update(user).set({ name: "new" });',
    '  });',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /new-transaction\.ts:3 transaction/u);
  assert.match(failingResult.stdout, /new-transaction\.ts:4 update/u);
});

test('db access guard catches aliased db imports and local aliases', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/aliased.ts', [
    "import { db as database } from '@interdomestik/database';",
    'export async function aliasedImport() {',
    '  return database.select().from(user);',
    '}',
  ]);
  writeFixture(tempRoot, 'apps/web/src/features/example/assigned.ts', [
    "import { db } from '@/lib/db.server';",
    'const database = db;',
    'export async function assignedAlias() {',
    '  return database.query.user.findFirst({});',
    '}',
  ]);

  const failingResult = runAppGuard(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stdout, /aliased\.ts:3 select/u);
  assert.match(failingResult.stdout, /assigned\.ts:4 query/u);
});

test('db access guard ignores type-only typeof db method references', () => {
  const tempRoot = createTempRepo();
  writeEmptyBaseline(tempRoot);
  writeFixture(tempRoot, 'apps/web/src/features/example/types.ts', [
    "import { db } from '@interdomestik/database';",
    'type QueryReference = typeof db.query.user;',
    'type UpdateReference = Awaited<ReturnType<typeof db.update>>;',
  ]);

  const passingResult = runAppGuard(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
});
