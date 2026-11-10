import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  assertPilotAuditVisibility,
  formatPilotBranchReport,
  pilotBranchReportQuery,
} from '../src/scripts/pilot-branch-report';
import { parsePilotBranchArgs, resolvePilotBranchTarget } from '../src/scripts/pilot-branch-target';

const render = (ids = ['tenant_ks']) => new PgDialect().sqlToQuery(pilotBranchReportQuery(ids));

test('audit is one parameterized SELECT scoped to explicit tenants across all required records', () => {
  const query = render(['tenant_ks', 'tenant_mk', 'tenant_ks']);
  assert.deepEqual(query.params, ['tenant_ks', 'tenant_mk']);
  assert.match(query.sql, /^with targets as/i);
  assert.doesNotMatch(query.sql, /\b(insert|update|delete|alter|create|drop|truncate)\b/i);
  for (const table of ['"user"', 'claim', 'subscriptions', 'support_handoffs']) {
    assert.ok(query.sql.includes(`from ${table} `));
  }
  assert.equal((query.sql.match(/join targets t on t.tenant_id =/g) ?? []).length, 5);
  assert.match(query.sql, /s.tenant_id = t.tenant_id/);
  assert.match(query.sql, /s.category = 'branches' and s.key = 'multi_branch'/);
  assert.match(query.sql, /s.value -> 'enabled' = 'true'::jsonb/);
  assert.match(query.sql, /not p.multi_branch and p.active_count <> 1/);
  assert.match(query.sql, /b.is_active = true/);
  assert.match(query.sql, /b.id = r.branch_id and b.tenant_id = r.tenant_id/);
  assert.match(query.sql, /where b.id is null/);
  assert.match(query.sql, /'staff', 'agent', 'branch_manager'/);
  assert.doesNotMatch(query.sql, /\b(email|name|message|subject|token)\b/);
  assert.throws(() => pilotBranchReportQuery([]));
  assert.throws(() => pilotBranchReportQuery(["tenant'; delete"]));
});

test('report groups violations using counts and ids, without leaking extra row properties', () => {
  assert.deepEqual(formatPilotBranchReport([]), ['violations=0']);
  const rows = [
    { tenant_id: 'tenant_ks', kind: 'claim', id: 'claim-1', email: 'private@example.test' },
    { tenant_id: 'tenant_ks', kind: 'claim', id: 'claim-2', email: 'private@example.test' },
    { tenant_id: 'tenant_mk', kind: 'active_branch_count', id: 'tenant_mk' },
  ];
  assert.deepEqual(formatPilotBranchReport(rows), [
    'violations=3',
    'tenant_ks/claim count=2 ids="claim-1","claim-2"',
    'tenant_mk/active_branch_count count=1 ids="tenant_mk"',
  ]);
});

test('audit refuses incomplete RLS visibility rather than treating invisible rows as clean', () => {
  for (const visibility of [false, undefined, null, 'true']) {
    assert.throws(() => assertPilotAuditVisibility(visibility));
  }
  assert.doesNotThrow(() => assertPilotAuditVisibility(true));
});

test('remote and production targets require exact credential-free confirmation', () => {
  const remote = 'postgres://audit:secret@db.example.test:5432/postgres';
  assert.throws(() => resolvePilotBranchTarget(remote));
  assert.throws(() => resolvePilotBranchTarget(remote, 'other:5432/postgres'));
  assert.equal(
    resolvePilotBranchTarget(remote, 'db.example.test:5432/postgres').ssl,
    'verify-full'
  );
  assert.throws(() => resolvePilotBranchTarget(`${remote}?host=other`));
  assert.throws(() => resolvePilotBranchTarget('invalid'));
  const env = {
    DATABASE_URL: 'postgres://audit:secret@localhost:5432/dev',
    NODE_ENV: 'production',
  };
  assert.throws(() => parsePilotBranchArgs(['--tenant', 'tenant_ks'], env));
  assert.deepEqual(
    parsePilotBranchArgs(['--tenant', 'tenant_ks', '--target', 'localhost:5432/dev'], env)
      .tenantIds,
    ['tenant_ks']
  );
  assert.throws(() => parsePilotBranchArgs([], env));
  assert.throws(() => parsePilotBranchArgs(['--tenant', '--target'], env));
});
