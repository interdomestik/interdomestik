import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  sealFixture,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

test('v2 shorthand clients and completed transaction handles cannot escape inventory', () => {
  const sources = [
    [
      'import {db} from "@interdomestik/database";',
      'const box={db};export default function Page(){return box.db.$client("sql");}',
    ],
    [
      'import {dbAdmin} from "@interdomestik/database";import {register} from "external-library";',
      'export default function Page(){return register({dbAdmin});}',
    ],
    [
      'import {db} from "@interdomestik/database";',
      'const box={db};const {db:client}=box;export default function Page(){return client.$client("sql");}',
    ],
    [
      'import {db} from "@interdomestik/database";',
      'function getClient(){return {db};}export default function Page(){return getClient().db.$client("sql");}',
    ],
    [
      'import {db} from "@interdomestik/database";',
      'export default function Page({db:client}={db}){return client.$client("sql");}',
    ],
    [
      'import * as connection from "@interdomestik/database";',
      'const {db}=connection;export default function Page(){return db.$client("sql");}',
    ],
    [
      'import * as connection from "@interdomestik/database";',
      'const {dbAdmin:client}=connection;export default function Page(){return client.$client("sql");}',
    ],
    [
      'import {db} from "@interdomestik/database";',
      'const box={client:db};export default function Page(){return box.client.$client("sql");}',
    ],
    ...['tx', '({tx})', '(()=>{const box={tx};return box;})()'].map(value => [
      'import {withTenantContext} from "@interdomestik/database";',
      `export async function read(){const escaped=await withTenantContext({},async tx=>${value});return escaped.selectDistinct().from(user);}`,
    ]),
    [
      'import {withTenantContext} from "@interdomestik/database";',
      'export async function read(){const escaped=await withTenantContext({},async tx=>tx);return escaped.futureOperation();}',
    ],
    ['', 'const local=unknownFactory();export function read(){return local.futureOperation();}'],
  ];
  for (const source of sources) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/app/page.ts', source);
    assert.equal(runGuard(root).status, 1, source.join('\n'));
    const report = readReport(root);
    assert.ok(
      report.failingNewEntries.length ||
        report.incomplete.some(item => /unsupported|unknown|unresolved/.test(item.reason)),
      JSON.stringify(report)
    );
  }
});

test('selectDistinct remains safe only within proven callback and resolved local methods remain valid', () => {
  for (const source of [
    'import {withTenantContext} from "@interdomestik/database";export function read(c){return withTenantContext(c,async tx=>tx.selectDistinct().from(user));}',
    'import {pgEnum} from "drizzle-orm/pg-core";export const status=pgEnum("status",["open","closed"]);',
    'const box={run(){return "safe";}};export default function Page(){return box.run();}',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/app/page.ts', source);
    assert.equal(runGuard(root).status, 0, JSON.stringify(readReport(root)));
  }
});

test('returning a tenant handle is rejected even without a later database method', () => {
  for (const body of [
    'return tx;',
    'return await tx;',
    'return (0,tx);',
    'return tx??null;',
    'return tx.query;',
    'return tx["query"];',
    'return {tx};',
    'return [tx];',
    'const box={tx};return box;',
    'const {client}={client:tx};return client;',
    'return ()=>tx;',
  ]) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/app/page.ts', [
      'import {withTenantContext} from "@interdomestik/database";',
      `export function read(){return withTenantContext({},async tx=>{${body}});}`,
    ]);
    assert.equal(runGuard(root).status, 1, body);
    assert.ok(
      readReport(root).failingNewEntries.some(
        item => item.reason === 'tenant transaction handle escapes callback'
      ),
      body
    );
  }
});

test('returned handle alias bound exhaustion is incomplete rather than safe', () => {
  const root = createTempRepo();
  const aliases = Array.from(
    { length: 140 },
    (_, i) => `const a${i}=${i ? `a${i - 1}` : 'tx'};`
  ).join('');
  writeFixture(root, 'apps/web/src/app/page.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    `export function read(){return withTenantContext({},async tx=>{${aliases}return a139;});}`,
  ]);
  assert.equal(runGuard(root).status, 1);
  assert.equal(readReport(root).status, 'incomplete');
  assert.match(readReport(root).incomplete[0].reason, /returned handle analysis bound/);
});

test('unchanged bounded-out return debt is historical until remounted', () => {
  const root = createTempRepo();
  const aliases = Array.from(
    { length: 140 },
    (_, i) => `const a${i}=${i ? `a${i - 1}` : 'tx'};`
  ).join('');
  writeFixture(root, 'apps/web/src/legacy.ts', [
    'import {withTenantContext} from "@interdomestik/database";',
    `export function read(){return withTenantContext({},async tx=>{${aliases}return a139;});}`,
  ]);
  sealFixture(root);
  assert.equal(runGuard(root).status, 0);
  writeFixture(
    root,
    'apps/web/src/app/page.ts',
    'import {read} from "../legacy";export default function Page(){return read();}'
  );
  assert.equal(runGuard(root).status, 1);
  assert.equal(readReport(root).status, 'incomplete');
  assert.ok(
    readReport(root).incomplete.some(item => /returned handle analysis bound/.test(item.reason))
  );
});
