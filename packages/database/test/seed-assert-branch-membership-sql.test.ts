import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { BRANCH_MEMBERSHIP_CHECKS } from '../src/seed-assert-branch-membership';

const ROLLBACK = Symbol('rollback');

type Tx = postgres.TransactionSql;

/** Ids of the rows each scenario writes; every row is rolled back with the transaction. */
function scenarioIds() {
  const id = (name: string) => `bm_${name}_${randomUUID()}`;
  return {
    tenantA: id('tenant_a'),
    tenantB: id('tenant_b'),
    branchA1: id('branch_a1'),
    branchA2: id('branch_a2'),
    branchB: id('branch_b'),
    cleanAgent: id('clean_agent'),
    cleanAgentGrant: id('clean_agent_grant'),
    cleanStaff: id('clean_staff'),
    cleanStaffGrant: id('clean_staff_grant'),
    cleanClaim: id('clean_claim'),
    branchlessAgent: id('branchless_agent'),
    foreignBranchUser: id('foreign_branch_user'),
    branchlessGrantUser: id('branchless_grant_user'),
    branchlessGrant: id('branchless_grant'),
    foreignBranchGrantUser: id('foreign_branch_grant_user'),
    foreignBranchGrant: id('foreign_branch_grant'),
    foreignTenantGrantUser: id('foreign_tenant_grant_user'),
    foreignTenantGrant: id('foreign_tenant_grant'),
    unbranchedUserWithBranchGrant: id('unbranched_user'),
    unbranchedUserGrant: id('unbranched_user_grant'),
    twoBranchUser: id('two_branch_user'),
    twoBranchGrantOne: id('two_branch_grant_1'),
    twoBranchGrantTwo: id('two_branch_grant_2'),
    foreignBranchClaim: id('foreign_branch_claim'),
    foreignBranchSubscription: id('foreign_branch_subscription'),
  };
}

type Ids = ReturnType<typeof scenarioIds>;

async function insertUser(
  tx: Tx,
  row: { id: string; tenantId: string; role: string; branchId: string | null }
) {
  await tx`insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt",
      "tenant_id", "role", "branch_id")
    values (${row.id}, ${row.id}, ${`${row.id}@example.test`}, true, now(), now(),
      ${row.tenantId}, ${row.role}, ${row.branchId})`;
}

async function insertGrant(
  tx: Tx,
  row: { id: string; tenantId: string; userId: string; role: string; branchId: string | null }
) {
  await tx`insert into user_roles ("id", "tenant_id", "user_id", "role", "branch_id")
    values (${row.id}, ${row.tenantId}, ${row.userId}, ${row.role}, ${row.branchId})`;
}

async function writeScenario(tx: Tx, ids: Ids) {
  for (const [tenant, code] of [
    [ids.tenantA, 'XA'],
    [ids.tenantB, 'XB'],
  ]) {
    await tx`insert into tenants ("id", "name", "legal_name", "country_code")
      values (${tenant}, ${tenant}, ${tenant}, ${code})`;
  }
  for (const [branch, tenant] of [
    [ids.branchA1, ids.tenantA],
    [ids.branchA2, ids.tenantA],
    [ids.branchB, ids.tenantB],
  ]) {
    await tx`insert into branches ("id", "tenant_id", "name", "slug")
      values (${branch}, ${tenant}, ${branch}, ${branch})`;
  }

  const a = ids.tenantA;
  await insertUser(tx, { id: ids.cleanAgent, tenantId: a, role: 'agent', branchId: ids.branchA1 });
  await insertUser(tx, { id: ids.cleanStaff, tenantId: a, role: 'staff', branchId: null });
  await insertUser(tx, { id: ids.branchlessAgent, tenantId: a, role: 'agent', branchId: null });
  await insertUser(tx, {
    id: ids.foreignBranchUser,
    tenantId: a,
    role: 'member',
    branchId: ids.branchB,
  });
  for (const userId of [
    ids.branchlessGrantUser,
    ids.foreignBranchGrantUser,
    ids.unbranchedUserWithBranchGrant,
    ids.twoBranchUser,
  ]) {
    await insertUser(tx, { id: userId, tenantId: a, role: 'member', branchId: null });
  }
  await insertUser(tx, {
    id: ids.foreignTenantGrantUser,
    tenantId: ids.tenantB,
    role: 'member',
    branchId: null,
  });

  const grants = [
    [ids.cleanAgentGrant, a, ids.cleanAgent, 'agent', ids.branchA1],
    [ids.cleanStaffGrant, a, ids.cleanStaff, 'staff', null],
    [ids.branchlessGrant, a, ids.branchlessGrantUser, 'branch_manager', null],
    [ids.foreignBranchGrant, a, ids.foreignBranchGrantUser, 'agent', ids.branchB],
    [ids.foreignTenantGrant, a, ids.foreignTenantGrantUser, 'staff', null],
    [ids.unbranchedUserGrant, a, ids.unbranchedUserWithBranchGrant, 'agent', ids.branchA1],
    [ids.twoBranchGrantOne, a, ids.twoBranchUser, 'agent', ids.branchA1],
    [ids.twoBranchGrantTwo, a, ids.twoBranchUser, 'branch_manager', ids.branchA2],
  ] as const;
  for (const [id, tenantId, userId, role, branchId] of grants) {
    await insertGrant(tx, { id, tenantId, userId, role, branchId });
  }

  for (const [claimId, branchId] of [
    [ids.cleanClaim, ids.branchA1],
    [ids.foreignBranchClaim, ids.branchB],
  ]) {
    await tx`insert into claim ("id", "tenant_id", "userId", "title", "category", "companyName",
        "branch_id")
      values (${claimId}, ${a}, ${ids.cleanStaff}, 'Branch rule', 'vehicle', 'Acme', ${branchId})`;
  }
  await tx`insert into subscriptions ("id", "tenant_id", "user_id", "plan_id", "branch_id")
    values (${ids.foreignBranchSubscription}, ${a}, ${ids.cleanStaff}, 'standard', ${ids.branchB})`;
}

function expectedViolations(ids: Ids): Record<string, string[]> {
  return {
    'agent or branch manager without a branch': [ids.branchlessAgent],
    'user in a branch of another tenant': [ids.foreignBranchUser],
    'agent or branch manager role grant without a branch': [ids.branchlessGrant],
    'role grant in a branch of another tenant': [ids.foreignBranchGrant],
    'role grant in another tenant than the user': [ids.foreignTenantGrant],
    'role grant outside the user branch': [ids.unbranchedUserGrant, ids.twoBranchGrantOne],
    'user with role grants in more than one branch': [ids.twoBranchUser],
    'claim in a branch of another tenant': [ids.foreignBranchClaim],
    'subscription in a branch of another tenant': [ids.foreignBranchSubscription],
  };
}

test('branch membership rules flag each broken row and no clean row', async t => {
  if (!process.env.DATABASE_URL) {
    if (process.env.REQUIRE_RLS_INTEGRATION === '1') {
      assert.fail(
        'Branch membership SQL test requires DATABASE_URL when REQUIRE_RLS_INTEGRATION=1.'
      );
    }
    t.skip('DATABASE_URL is required for the branch membership SQL test');
    return;
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const ids = scenarioIds();
  const cleanIds = [
    ids.cleanAgent,
    ids.cleanAgentGrant,
    ids.cleanStaff,
    ids.cleanStaffGrant,
    ids.cleanClaim,
  ];
  try {
    await sql
      .begin(async tx => {
        await writeScenario(tx, ids);
        const dialect = new PgDialect();
        const expected = expectedViolations(ids);
        assert.deepEqual(
          BRANCH_MEMBERSHIP_CHECKS.map(check => check.label).sort(),
          Object.keys(expected).sort()
        );
        for (const check of BRANCH_MEMBERSHIP_CHECKS) {
          const query = dialect.sqlToQuery(check.query);
          const rows = await tx.unsafe(
            query.sql,
            query.params as postgres.ParameterOrJSON<never>[]
          );
          const found = new Set(rows.map(row => String(row.id)));
          for (const id of expected[check.label]) assert.ok(found.has(id), `${check.label}: ${id}`);
          for (const id of cleanIds) assert.ok(!found.has(id), `${check.label} flags clean ${id}`);
        }
        throw ROLLBACK;
      })
      .catch(error => {
        if (error !== ROLLBACK) throw error;
      });
  } finally {
    await sql.end();
  }
});
