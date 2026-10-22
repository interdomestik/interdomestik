import fs from 'node:fs';
import path from 'node:path';
import { createTempRepo, writeFixture, sealFixture } from './db-access-guard-test-utils.mjs';
import { evaluateGuard } from './db-access-evaluator.mjs';
import { digest } from './db-access-trust.mjs';

export const DB = 'packages/database/src/db.ts';
export const HELPER = 'packages/database/src/provider-helper.ts';
export const OLD = 'apps/web/src/old-provider-consumer.ts';
export const PREDICATE = 'apps/web/src/consumer-predicate.ts';
const BASELINE = 'scripts/ci/db-access-baseline.json';
export function setup(scoped = false) {
  const root = createTempRepo();
  writeFixture(root, PREDICATE, 'export const predicate = true;');
  writeFixture(root, OLD, [
    'import { db, withTenantContext } from "@interdomestik/database";',
    'import { predicate } from "./consumer-predicate";',
    scoped
      ? 'export async function read(role) { if (role !== "admin") return []; return withTenantContext({tenantId:"a"},async tx=>{await tx.execute("select 1");return [];}); }'
      : 'export function read() { return db.select().where(predicate); }',
  ]);
  sealFixture(root);
  const adoption = JSON.parse(fs.readFileSync(path.join(root, '.fixture-adoption.json')));
  writeFixture(root, DB, [
    'import { marker } from "./provider-helper";',
    'export const db = {} as any;',
    'export const dbRls = {} as any;',
    'export const dbAdmin = {} as any;',
    'export function catalog() { marker; return dbRls.execute("catalog-only"); }',
  ]);
  writeFixture(root, HELPER, 'export const marker = 1;');
  const record = file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { sha256: digest(bytes), bytes: bytes.length, mode: '100644' };
  };
  const names = [...adoption.critical, HELPER];
  const policy = {
    version: 1,
    id: 'fixture-provider-transition',
    adoptionCommit: adoption.commit,
    adoptionTree: adoption.tree,
    baselineSha256: adoption.files[BASELINE],
    baselineBytes: record(BASELINE).bytes,
    files: Object.fromEntries(
      names.map(file => [
        file,
        {
          ...record(file),
          local: file === DB ? [HELPER] : [],
          external: [],
        },
      ])
    ),
    resolverFiles: { 'packages/database/package.json': record('packages/database/package.json') },
    publicModules: [DB, 'packages/database/src/tenant.ts'],
    testHarness: {},
    runtimeEnforcement: {
      id: 'fixture-runtime',
      mode: 'required-direct-execution',
      requiredTests: 9,
      acceptedReceiptInputs: false,
    },
  };
  return { root, adoption, policy, evaluate: () => evaluateGuard(root, adoption, policy) };
}
