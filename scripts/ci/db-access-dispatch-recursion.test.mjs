import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTempRepo,
  sealFixture,
  writeFixture,
  runGuard,
  readReport,
  scan,
} from './db-access-guard-test-utils.mjs';

for (const reached of [false, true])
  test(`historical recursive return ${reached ? 'reached' : 'unreached'} remains bounded without native stack failure`, () => {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', 'export function recurse(){return recurse();}');
    sealFixture(root);
    writeFixture(
      root,
      'apps/web/src/app/page.tsx',
      reached
        ? 'import {recurse} from "../legacy"; export default function Page(){return recurse();}'
        : 'export default function Page(){return 1;}'
    );
    const result = runGuard(root);
    const report = readReport(root);
    assert.equal(result.status, reached ? 1 : 0, JSON.stringify(report));
    assert.equal(report.status, reached ? 'incomplete' : 'pass');
    assert.doesNotMatch(JSON.stringify(report), /Maximum call stack|RangeError/u);
    if (reached)
      assert.ok(
        report.incomplete.some(item => /recursive|bound|cycle/u.test(item.reason)),
        JSON.stringify(report)
      );
    else {
      assert.equal(report.failingNewCount, 0);
      assert.deepEqual(report.incomplete, []);
    }
  });

const context = 'import {db,withTenantContext} from "@interdomestik/database";';
for (const [label, source, expected] of [
  [
    'finite same-AST distinct closure frames',
    'function lift(next:any){return()=>next();}function leaf(){return{select(){return 1;}};}const a=lift(leaf);const b=lift(a);b().select();',
    0,
  ],
  [
    'unknown sibling remains unknown',
    'import {getClient} from "external-library";function lift(next:any){return()=>next();}const a=lift(()=>({select(){return 1;}}));const b=lift(()=>getClient());a().select();b().select();',
    1,
  ],
  [
    'actual transaction return wins beside recursive return',
    'function recur(x:any){if(flag)return x;return recur(x);}withTenantContext({},tx=>recur(tx));',
    1,
  ],
  [
    'recursive closure capturing transaction remains rejected',
    'withTenantContext({},tx=>{function recurse(){if(flag)return tx;return recurse();}return recurse();});',
    1,
  ],
])
  test(`recursive return control: ${label}`, () => {
    const { result, report } = scan(`${context}${source}`);
    assert.equal(result.status, expected, JSON.stringify(report));
    assert.doesNotMatch(JSON.stringify(report), /Maximum call stack|RangeError/u);
    if (expected)
      assert.ok(report.failingNewCount > 0 || report.incomplete.length > 0, JSON.stringify(report));
    else {
      assert.equal(report.status, 'pass');
      assert.deepEqual(report.incomplete, []);
    }
    if (label.includes('transaction'))
      assert.ok(
        report.newEntries.some(
          item =>
            item.tenantPosture === 'tenant-context' &&
            item.reason === 'tenant transaction handle escapes callback'
        ),
        JSON.stringify(report)
      );
  });
