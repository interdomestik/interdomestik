import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  rootDir,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

const ambient = [
  'import { db } from "@interdomestik/database";',
  'export function old() { return db.query.user.findFirst({ where: () => true }); }',
];

test('formerly scoped predicate, context role and terminating admission weakening cannot inherit safe posture', () => {
  for (const [oldValue, newValue] of [
    ['eq(user.owner,owner)', 'true'],
    ['role:"member"', 'role:"admin"'],
    ['if(!admitted)throw Error("deny");', ''],
  ]) {
    const root = createTempRepo();
    const original = [
      'import {withTenantContext} from "@interdomestik/database";',
      'export function read(tenantId,owner,admitted){if(!admitted)throw Error("deny"); return withTenantContext({tenantId,role:"member"},async tx=>tx.select().from(user).where(eq(user.owner,owner)));}',
    ];
    writeFixture(root, 'apps/web/src/old.ts', original);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/old.ts', original.join('\n').replace(oldValue, newValue));
    assert.equal(runGuard(root).status, 1);
    assert.ok(
      readReport(root).failingNewEntries.some(entry =>
        /scoped executable controls/u.test(entry.reason ?? '')
      )
    );
  }
});

test('candidate tsconfig paths and environment trust selectors cannot counterfeit root context', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { paths: { '@interdomestik/database': ['./src/fake.ts'] } } })
  );
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /resolver boundary.*tsconfig/u);
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts/check-db-access-guard.mjs')],
    { cwd: root, encoding: 'utf8', env: { ...process.env, DB_ACCESS_GUARD_TRUST_ROOT: 'HEAD' } }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /environment override/u);
});

test('candidate symlinks and self-authored exclusion catalogs cannot hide source', () => {
  const root = createTempRepo();
  fs.mkdirSync(path.join(root, 'apps/web/src'), { recursive: true });
  fs.symlinkSync('/etc/passwd', path.join(root, 'apps/web/src/escape.ts'));
  assert.equal(runGuard(root).status, 1);
  assert.match(readReport(root).incomplete[0].reason, /symlink/u);
  const catalog = createTempRepo();
  writeFixture(catalog, 'scripts/ci/db-access-constants.mjs', 'export const DIRECT_DB_METHODS=[];');
  writeFixture(catalog, 'scripts/ci/db-access-catalog.json', '{"approved":["*"]}');
  writeFixture(catalog, 'apps/web/src/new.ts', ambient);
  assert.equal(runGuard(catalog).status, 1);
});
