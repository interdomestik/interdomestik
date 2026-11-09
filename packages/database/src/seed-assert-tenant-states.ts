import { eq, inArray } from 'drizzle-orm';
import { E2E_USER_IDS } from './e2e-role-fixtures';
import { E2E_USERS } from './e2e-users';
import {
  E2E_BRANCH_STATE_FIXTURES,
  E2E_TENANT_STATE_FIXTURES,
  E2E_THIRD_TENANT_FIXTURE,
} from './e2e-tenant-state-fixtures';
import { compareExactSet } from './seed-assert-cash';
import { compareRow } from './seed-assert-lifecycle';
import { buildInactiveBranchToSeed, buildTenantStatesToSeed } from './seed-golden/tenant-states';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

export async function collectTenantStateViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures: string[] = [];
  const expected = buildTenantStatesToSeed();
  const tenants = await db
    .select()
    .from(schema.tenants)
    .where(
      inArray(
        schema.tenants.id,
        expected.map(row => row.id)
      )
    );
  compareExactSet(failures, 'tenant states', tenants, expected);
  for (const tenant of expected) {
    compareRow(
      failures,
      tenant.id,
      tenants.find(row => row.id === tenant.id),
      tenant
    );
  }
  const inactiveBranch = buildInactiveBranchToSeed();
  const branches = await db
    .select()
    .from(schema.branches)
    .where(
      inArray(schema.branches.id, [inactiveBranch.id, E2E_BRANCH_STATE_FIXTURES.EMPTY_BRANCH.id])
    );
  compareRow(
    failures,
    inactiveBranch.id,
    branches.find(row => row.id === inactiveBranch.id),
    inactiveBranch
  );
  const emptyBranch = E2E_BRANCH_STATE_FIXTURES.EMPTY_BRANCH;
  compareRow(
    failures,
    emptyBranch.id,
    branches.find(row => row.id === emptyBranch.id),
    {
      ...emptyBranch,
      isActive: true,
    }
  );

  // Empty means no business population, not merely an empty claims list.
  const emptyTenantId = E2E_TENANT_STATE_FIXTURES.EMPTY_TENANT.id;
  for (const table of [
    schema.branches,
    schema.user,
    schema.claims,
    schema.subscriptions,
    schema.agentClients,
    schema.memberLeads,
  ]) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.tenantId, emptyTenantId));
    compareExactSet(failures, `empty tenant ${emptyTenantId}`, rows, []);
  }
  for (const table of [schema.user, schema.claims, schema.subscriptions, schema.memberLeads]) {
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.branchId, emptyBranch.id));
    compareExactSet(failures, `empty branch ${emptyBranch.id}`, rows, []);
  }

  // Pin the existing third-tenant target and both actors; this describes data, not an access proof.
  const third = E2E_THIRD_TENANT_FIXTURE;
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, third.tenantId));
  compareRow(failures, 'third tenant', tenant, { id: third.tenantId, isActive: true });
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.id, third.branchId));
  compareRow(failures, 'third tenant branch', branch, {
    id: third.branchId,
    tenantId: third.tenantId,
  });
  const keys = [
    third.relationship.allowedActor,
    third.relationship.deniedActor,
    'PILOT_MK_MEMBER',
  ] as const;
  const users = await db
    .select()
    .from(schema.user)
    .where(
      inArray(
        schema.user.id,
        keys.map(key => E2E_USER_IDS[key])
      )
    );
  for (const key of keys) {
    compareRow(
      failures,
      `third tenant ${key}`,
      users.find(row => row.id === E2E_USER_IDS[key]),
      {
        id: E2E_USER_IDS[key],
        tenantId: E2E_USERS[key].tenantId,
        role: E2E_USERS[key].dbRole,
        ...(key === 'PILOT_MK_MEMBER' ? { branchId: third.branchId } : {}),
      }
    );
  }
  return failures;
}
