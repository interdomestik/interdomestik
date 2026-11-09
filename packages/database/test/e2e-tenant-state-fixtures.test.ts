import assert from 'node:assert/strict';
import test from 'node:test';

import {
  E2E_BRANCH_STATE_FIXTURES,
  E2E_TENANT_STATE_FIXTURES,
  E2E_TENANT_STATE_INSTANTS,
  E2E_THIRD_TENANT_FIXTURE,
} from '../src/e2e-tenant-state-fixtures';
import { E2E_USER_IDS } from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import { collectTenantStateViolations } from '../src/seed-assert-tenant-states';
import {
  buildInactiveBranchToSeed,
  buildTenantStatesToSeed,
} from '../src/seed-golden/tenant-states';
import {
  buildBranchesToSeed,
  seedBranches,
  seedTenants,
} from '../src/seed-golden/tenants-branches';
import * as schema from '../src/schema';
import { sql } from 'drizzle-orm';
import { goldenId } from '../src/seed-utils/seed-ids';
import { assertUpsertedOnEachRun, createUpsertCaptureDb } from './seed-upsert-capture.support';

test('the golden branch seed includes the named inactive branch', () => {
  const branch = buildBranchesToSeed().find(row => row.id === goldenId('ks_branch_inactive'));
  assert.ok(branch, 'the inactive branch fixture must be seeded');
  assert.equal(branch.tenantId, 'tenant_ks');
  assert.equal('isActive' in branch && branch.isActive, false);
});

type Row = Record<string, unknown>;

function cleanRows(): Row[][] {
  const third = E2E_THIRD_TENANT_FIXTURE;
  const keys = ['PILOT_MK_ADMIN', 'KS_ADMIN', 'PILOT_MK_MEMBER'] as const;
  return [
    buildTenantStatesToSeed(),
    [buildInactiveBranchToSeed(), { ...E2E_BRANCH_STATE_FIXTURES.EMPTY_BRANCH, isActive: true }],
    ...Array.from({ length: 10 }, () => []),
    [{ id: third.tenantId, isActive: true }],
    [{ id: third.branchId, tenantId: third.tenantId }],
    keys.map(key => ({
      id: E2E_USER_IDS[key],
      tenantId: E2E_USERS[key].tenantId,
      role: E2E_USERS[key].dbRole,
      ...(key === 'PILOT_MK_MEMBER' ? { branchId: third.branchId } : {}),
    })),
  ];
}

async function violations(rows = cleanRows()): Promise<string[]> {
  let call = 0;
  const db = {
    select: () => ({ from: () => ({ where: async () => rows[call++] }) }),
  } as unknown as Parameters<typeof collectTenantStateViolations>[0];
  const result = await collectTenantStateViolations(db, schema);
  assert.equal(call, rows.length, 'every strict read runs');
  return result;
}

test('organization states have deterministic IDs, activation flags and fixed UTC instants', () => {
  const tenants = buildTenantStatesToSeed();
  assert.deepEqual(tenants, buildTenantStatesToSeed());
  assert.deepEqual(
    tenants.map(row => [row.id, row.isActive]),
    [
      [goldenId('tenant_empty'), true],
      [goldenId('tenant_inactive'), false],
    ]
  );
  const inactive = buildInactiveBranchToSeed();
  assert.deepEqual(inactive, buildInactiveBranchToSeed());
  for (const row of [...tenants, inactive]) {
    assert.equal(row.createdAt.toISOString(), E2E_TENANT_STATE_INSTANTS.CREATED);
    assert.equal(
      row.updatedAt.toISOString(),
      E2E_TENANT_STATE_INSTANTS[row.isActive ? 'CREATED' : 'DEACTIVATED']
    );
  }
  const ids = buildBranchesToSeed().map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('mk_branch_empty'), 'reuse the existing empty branch');
});

test('the named third-tenant target reuses pilot data outside both KS and MK', () => {
  const fixture = E2E_THIRD_TENANT_FIXTURE;
  assert.equal(fixture.tenantId, 'pilot-mk');
  assert.equal(fixture.memberId, E2E_USER_IDS.PILOT_MK_MEMBER);
  assert.equal(fixture.relationship.memberId, fixture.memberId);
  assert.equal(fixture.relationship.allowedActor, 'PILOT_MK_ADMIN');
  assert.equal(fixture.relationship.deniedActor, 'KS_ADMIN');
  assert.notEqual(E2E_USERS.KS_ADMIN.tenantId, fixture.tenantId);
  assert.notEqual(E2E_USERS.MK_ADMIN.tenantId, fixture.tenantId);
});

test('strict organization assertion accepts the exact fixtures and rejects every missing row or wrong field', async () => {
  assert.deepEqual(await violations(), []);
  for (const index of [0, 1, 12, 13, 14]) {
    for (const [rowIndex, row] of cleanRows()[index].entries()) {
      const missing = cleanRows();
      missing[index].splice(rowIndex, 1);
      assert.ok((await violations(missing)).length > 0, `${index}:${String(row.id)} missing`);
      for (const field of Object.keys(row)) {
        const wrong = cleanRows();
        wrong[index][rowIndex] = { ...row, [field]: 'drifted' };
        assert.ok((await violations(wrong)).length > 0, `${String(row.id)}.${field}`);
      }
    }
  }
});

test('empty tenant and empty branch fail on unexpected business population', async () => {
  for (let index = 2; index < 12; index++) {
    const rows = cleanRows();
    rows[index] = [{ id: 'unexpected' }];
    assert.ok(
      (await violations(rows)).some(message => message.includes('unexpected')),
      String(index)
    );
  }
  assert.equal(E2E_TENANT_STATE_FIXTURES.EMPTY_TENANT.isActive, true);
});

test('normal tenant and branch seed steps upsert every new fixture field on repeated runs', async t => {
  const capture = createUpsertCaptureDb();
  const db = capture.db as Parameters<typeof seedTenants>[0]['db'];
  const context = { db, schema, sql, at: () => new Date(0) };
  t.mock.method(console, 'log', () => {});
  for (let run = 0; run < 2; run++) {
    await seedTenants(context);
    await seedBranches(context);
  }
  assertUpsertedOnEachRun(
    capture.writes,
    [...buildTenantStatesToSeed(), buildInactiveBranchToSeed()],
    2
  );
});
