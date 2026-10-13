import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan } from './db-access-guard-test-utils.mjs';
const context = `import {db,withTenantContext} from '@interdomestik/database';`;
// Finite source dispatch still cannot prove a DB-named method keeps its own implementation after
// runtime deletion, prototype replacement, setter effects or equivalent cross-source mutation.
const cases = [
  [
    'returned-closure DB-named receiver stays unknown despite distinct defining frames',
    1,
    `function lift(next:any){return()=>next();}function leaf(){return{select(){return 1;}};}const a=lift(leaf);const b=lift(a);b().select();`,
  ],
  [
    'own-chain DB-named receiver stays unknown despite a finite method AST',
    1,
    `function link(next:any){return{go(){return next.go();}};}const end={go(){return{select(){return 1;}};}};const a=link(end);const b=link(a);b.go().select();`,
  ],
  [
    'actual recursive closure remains unknown',
    1,
    `function lift(next:any){return()=>next();}const a=lift(()=>a());a().select();`,
  ],
  [
    'ambient retained method remains inspected beside object self identity',
    1,
    `const chain={select(){return chain;},where(){return chain;},hidden(){return db.select();}};chain.select().where();`,
  ],
  [
    'actual bound local method may use transaction only within callback',
    0,
    `const local={read(x:any){return x.select();}};withTenantContext({},tx=>local.read(tx));`,
  ],
  [
    'actual local method returning a transaction fails',
    1,
    `const local={read(x:any){return x;}};withTenantContext({},tx=>local.read(tx));`,
  ],
  [
    'nested opaque method preserves capture through a local alias',
    1,
    `import {later} from 'external-library';function make(x:any){const alias=x;const run=()=>alias.select();return{run};}withTenantContext({},tx=>later(make(tx).run));`,
  ],
  [
    'async factory return remains opaque',
    1,
    `async function make(){return{select(){return 1;}};}make().select();`,
  ],
];
for (const [label, status, body] of cases)
  test(`authenticated invocation lifetime: ${label}`, () => {
    const { result, report } = scan(`${context}${body}`);
    assert.equal(result.status, status, JSON.stringify(report));
    assert.equal(report.status === 'pass', status === 0, JSON.stringify(report));
    if (status) assert.ok(report.failingNewCount > 0 || report.incomplete.length > 0);
    else {
      assert.equal(report.failingNewCount, 0);
      assert.deepEqual(report.incomplete, []);
    }
  });
