import assert from 'node:assert/strict';
import test from 'node:test';
import { scan } from './db-access-guard-test-utils.mjs';

const DATABASE = '@interdomestik/database';

function assertPass(source, label) {
  const { result, report } = scan(source);
  assert.equal(result.status, 0, `${label}\n${JSON.stringify(report)}`);
  assert.equal(report.status, 'pass', label);
  assert.deepEqual(report.incomplete, [], label);
  return report;
}

function assertFailClosed(source, label) {
  const { result, report } = scan(source);
  assert.equal(result.status, 1, `${label}\n${JSON.stringify(report)}`);
  assert.notEqual(report.status, 'pass', label);
  assert.ok(
    report.failingNewEntries.length > 0 || report.incomplete.length > 0,
    `${label}\n${JSON.stringify(report)}`
  );
  return report;
}

test('delete remains tenant-context only for the proven callback handle', () => {
  const scoped = assertPass(
    `import {withTenantContext} from "${DATABASE}";export function clean(){return withTenantContext({},tx=>tx.delete(user));}`,
    'canonical tenant transaction'
  );
  assert.ok(
    scoped.newEntries.some(
      entry => entry.method === 'delete' && entry.tenantPosture === 'tenant-context'
    )
  );

  for (const client of ['db', 'dbRls', 'dbAdmin']) {
    const report = assertFailClosed(
      `import {${client}} from "${DATABASE}";export function clean(){return ${client}.delete(user);}`,
      client
    );
    assert.ok(
      report.failingNewEntries.some(entry => entry.method === 'delete'),
      client
    );
  }
});

test('returned, thrown and yielded transaction containers remain rejected', () => {
  for (const [label, callback] of [
    ['returned', 'async tx=>({nested:[tx]})'],
    ['thrown', 'async tx=>{throw {nested:[tx]};}'],
    ['yielded', 'async function*(tx){yield {nested:[tx]};}'],
  ]) {
    const report = assertFailClosed(
      `import {withTenantContext} from "${DATABASE}";export function clean(){return withTenantContext({},${callback});}`,
      label
    );
    assert.ok(
      [...report.failingNewEntries, ...report.incomplete].some(entry =>
        /handle|tenant callback/u.test(entry.reason)
      ),
      `${label}\n${JSON.stringify(report)}`
    );
  }
});
