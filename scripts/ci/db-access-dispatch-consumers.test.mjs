import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTempRepo,
  writeFixture,
  runGuard,
  readReport,
  scan,
} from './db-access-guard-test-utils.mjs';
const tenant = `import {withTenantContext,db} from '@interdomestik/database';`;
function accepted(source) {
  const { result, report } = scan(source);
  assert.equal(result.status, 0, JSON.stringify(report));
  assert.equal(report.status, 'pass');
  assert.equal(report.failingNewCount, 0);
  assert.deepEqual(report.incomplete, []);
  return report;
}
function rejected(source, file) {
  const { result, report } = scan(source, file);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
  assert.ok(report.failingNewCount > 0 || report.incomplete.length > 0);
  return report;
}
for (const order of [
  'read(local);withTenantContext({},tx=>read(tx));',
  'withTenantContext({},tx=>read(tx));read(local);',
]) {
  test(`authenticated mixed source-local and canonical DB-named receivers fail closed: ${order}`, () => {
    // A canonical alternative cannot certify the dynamically mutable local alternative.
    const report = rejected(`${tenant} function read(tx:any){return tx.select();}
 const local={select(){return 1;}};${order}`);
    const entry = report.newEntries.find(item => item.callee === 'tx.select');
    assert.equal(entry.tenantPosture, 'covered-dispatch-alternatives');
    assert.notEqual(entry.tenantPosture, 'tenant-context');
    assert.deepEqual(
      new Set(entry.dispatchAlternatives.map(item => item.kind)),
      new Set(['canonical-tx', 'source-local'])
    );
  });
}
test('authenticated local factory alternative stays unknown beside a canonical transaction', () => {
  // Finite source dispatch proves traversal, not that the local receiver retains its own method.
  const report = rejected(`${tenant}function read(tx:any){return tx.select().where().limit();}
 function createTx(){const select=()=>{const chain={where(){return chain;},limit(){return 1;}};return chain;};const tx={select};return{tx};}
 const {tx}=createTx();read(tx);withTenantContext({},tx=>read(tx));`);
  assert.ok(
    report.newEntries.some(
      item => item.callee === 'tx.select' && item.tenantPosture === 'covered-dispatch-alternatives'
    )
  );
});
const negatives = [
  [
    'unknown body member beneath resolved outer call',
    `function read(x:any){return x.futureOperation();}const local={};read(local);`,
  ],
  [
    'ambient second allocation',
    `function read(x:any){return x.select();}const local={select(){return 1;}};read(local);read(db);`,
  ],
  [
    'unknown second allocation',
    `import {getClient} from 'external-library';function read(x:any){return x.select();}const local={select(){return 1;}};read(local);read(getClient());`,
  ],
  [
    'unknown reversed allocation',
    `import {getClient} from 'external-library';function read(x:any){return x.select();}const local={select(){return 1;}};read(getClient());read(local);`,
  ],
  [
    'facade ambient body',
    `const local={select(){return db.select();}};function read(x:any){return x.select();}read(local);`,
  ],
  [
    'factory ambient body',
    `function make(){db.select();return{select(){return 1;}};}function read(x:any){return x.select();}read(make());`,
  ],
  [
    'factory unknown body',
    `import {getClient} from 'external-library';function make(){getClient().select();return{select(){return 1;}};}make().select();`,
  ],
  [
    'returned transaction handle',
    `withTenantContext({},tx=>{const local={select(){return tx;}};return local.select();});`,
  ],
  [
    'returned captured callback',
    `withTenantContext({},tx=>{const alias=tx;const later=()=>alias.select();return later;});`,
  ],
  [
    'delayed captured callback',
    `withTenantContext({},tx=>{const alias=tx;setTimeout(()=>alias.select(),1);});`,
  ],
  [
    'opaque forwarded handle',
    `import {send} from 'external-library';const local={select(x:any){send(x);return 1;}};withTenantContext({},tx=>local.select(tx));`,
  ],
  [
    'method mutation',
    `const local={select(){return 1;}};local.select=()=>db.select();function read(x:any){return x.select();}read(local);`,
  ],
  [
    'alias mutation',
    `const local={select(){return 1;}};let alias=local;alias=db;function read(x:any){return x.select();}read(alias);`,
  ],
  [
    'opaque identity escape',
    `import {change} from 'external-library';const local={select(){return 1;}};change(local);function read(x:any){return x.select();}read(local);`,
  ],
  [
    'missing argument beside local caller',
    `function read(x:any){return x.select();}const local={select(){return 1;}};read(local);read();`,
  ],
  [
    'wrong argument beside local caller',
    `function read(x:any){return x.select();}const local={select(){return 1;}};read(local);read(local,2);`,
  ],
  ['missing argument', `function read(x:any){return x.select();}read();`],
  ['default argument', `function read(x:any=db){return x.select();}read();`],
  ['getter', `const box={get tx(){return db;}};box.tx.select();`],
  ['recursive factory', `function make(){return make();}make().select();`],
  [
    'unknown method chain',
    `import {getClient} from 'external-library';const local={select(){return getClient();}};local.select().where();`,
  ],
  [
    'conditional unknown alternative',
    `import {getClient} from 'external-library';const local={select(){return 1;}};function read(x:any){return x.select();}read(flag?local:getClient());`,
  ],
];
for (const [label, body] of negatives)
  test(`authenticated failclosed: ${label}`, () => rejected(`${tenant}${body}`));
test('unknown caller in hidden test filename remains fully scanned', () => {
  const file = 'apps/web/src/hidden.test.ts';
  const hidden = `${tenant}import {getClient} from 'external-library';function read(x:any){return x.select();}const local={select(){return 1;}};read(local);read(getClient());`;
  const report = rejected(hidden, file);
  assert.ok(
    report.newEntries.some(
      item => item.callee === 'x.select' && item.tenantPosture === 'unclassified'
    )
  );
  assert.ok(
    report.failingNewEntries.some(item => item.file === file && item.callee === 'x.select')
  );
  // Mounted by production, the same module is additionally traversed from the product root.
  const page = 'apps/web/src/app/page.tsx';
  const root = createTempRepo();
  writeFixture(root, file, hidden);
  writeFixture(root, page, [
    'import "../hidden.test";',
    'export default function Page(){return null;}',
  ]);
  const result = runGuard(root);
  const mounted = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(mounted));
  assert.notEqual(mounted.status, 'pass');
  assert.ok(mounted.incomplete.some(item => item.file === page));
  assert.ok(
    mounted.failingNewEntries.some(
      item =>
        item.file === file && item.callee === 'x.select' && item.mountedFromAll?.includes(page)
    ),
    JSON.stringify(mounted)
  );
});
for (const ambient of [false, true])
  test(`authenticated direct source import keeps mutable DB-named local method unknown (ambient=${ambient})`, () => {
    const root = createTempRepo();
    writeFixture(
      root,
      'apps/web/src/read.ts',
      `${tenant}const local={select(){return ${ambient ? 'db.select()' : '2'};}};export function read(x:any){local.select();return x.select();}`
    );
    writeFixture(
      root,
      'apps/web/src/example.ts',
      `${tenant}import {read} from './read';const local={select(){return 1;}};read(local);withTenantContext({},tx=>read(tx));`
    );
    const result = runGuard(root),
      report = readReport(root);
    // Source resolution selects bodies for traversal; it cannot prove an own method survives
    // runtime deletion, prototype replacement, setters or equivalent cross-source effects.
    assert.equal(result.status, 1, JSON.stringify(report));
    assert.notEqual(report.status, 'pass');
    assert.ok(
      report.failingNewEntries.some(
        item => item.callee === (ambient ? 'db.select' : 'local.select')
      )
    );
  });
test('authenticated mutable source export cannot hide a replacement behind its initializer', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/src/read.ts',
    `${tenant}export let read=(x:any)=>x.select();read=(x:any)=>db.select();`
  );
  writeFixture(
    root,
    'apps/web/src/example.ts',
    `import {read} from './read';const local={select(){return 1;}};read(local);`
  );
  const result = runGuard(root),
    report = readReport(root);
  assert.equal(result.status, 1, JSON.stringify(report));
  assert.notEqual(report.status, 'pass');
});
