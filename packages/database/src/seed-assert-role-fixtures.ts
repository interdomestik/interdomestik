import { and, eq, inArray } from 'drizzle-orm';
import {
  E2E_AGENT_LINK_FIXTURES,
  E2E_CASE_FIXTURES,
  E2E_MESSAGE_FIXTURES,
  E2E_ROLE_MATRIX,
  E2E_RUNTIME_ROLES,
  E2E_USER_IDS,
} from './e2e-role-fixtures';
import { E2E_USERS, type E2EUserKey } from './e2e-users';
import { buildUsersToSeed } from './seed-golden/users';

type AssertDb = (typeof import('./db'))['db'];
type AssertSchema = typeof import('./schema');

const FIXED_AT = () => new Date(0);

function expectEqual(failures: string[], label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    failures.push(
      `${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`
    );
  }
}

/** Pure check: the catalogue instantiates all nine runtime roles in at least two tenant contexts. */
export function collectRoleCatalogueViolations(): string[] {
  const failures: string[] = [];
  const seededUsers = new Map(buildUsersToSeed({ at: FIXED_AT }).map(u => [u.id, u]));
  const tenants = new Set<string>();

  for (const role of E2E_RUNTIME_ROLES) {
    const keys: readonly E2EUserKey[] = E2E_ROLE_MATRIX[role];
    if (keys.length === 0) failures.push(`role ${role}: no fixture identity`);
    for (const key of keys) {
      const fixture = E2E_USERS[key];
      const seeded = seededUsers.get(E2E_USER_IDS[key]);
      expectEqual(failures, `${key}.dbRole`, fixture.dbRole, role);
      if (!seeded) {
        failures.push(`${key}: ${E2E_USER_IDS[key]} is not produced by the golden user seed`);
        continue;
      }
      expectEqual(failures, `${key}.seed.email`, seeded.email, fixture.email);
      expectEqual(failures, `${key}.seed.role`, seeded.role, role);
      expectEqual(failures, `${key}.seed.tenantId`, seeded.tenantId, fixture.tenantId);
      tenants.add(seeded.tenantId);
    }
  }

  if (tenants.size < 2) failures.push(`role matrix spans ${tenants.size} tenant(s); expected >= 2`);
  return failures;
}

async function collectUserViolations(db: AssertDb, schema: AssertSchema, failures: string[]) {
  const seededUsers = new Map(buildUsersToSeed({ at: FIXED_AT }).map(u => [u.id, u]));
  const keys = Object.keys(E2E_USER_IDS) as E2EUserKey[];
  const ids = keys.map(key => E2E_USER_IDS[key]);

  const users = await db.query.user.findMany({
    where: inArray(schema.user.id, ids),
    columns: {
      id: true,
      email: true,
      role: true,
      tenantId: true,
      branchId: true,
      emailVerified: true,
    },
  });
  const accounts = await db.query.account.findMany({
    where: inArray(schema.account.userId, ids),
    columns: { id: true, userId: true, accountId: true, providerId: true, password: true },
  });
  const usersById = new Map(users.map(u => [u.id, u]));

  for (const key of keys) {
    const id = E2E_USER_IDS[key];
    const row = usersById.get(id);
    const seeded = seededUsers.get(id);
    if (!row || !seeded) {
      failures.push(`${key}: user ${id} missing`);
      continue;
    }
    expectEqual(failures, `${key}.email`, row.email, E2E_USERS[key].email);
    expectEqual(failures, `${key}.role`, row.role, E2E_USERS[key].dbRole);
    expectEqual(failures, `${key}.tenantId`, row.tenantId, E2E_USERS[key].tenantId);
    expectEqual(
      failures,
      `${key}.branchId`,
      row.branchId,
      'branchId' in seeded ? seeded.branchId : null
    );
    expectEqual(failures, `${key}.emailVerified`, row.emailVerified, true);

    const credentials = accounts.filter(a => a.userId === id && a.providerId === 'credential');
    if (credentials.length !== 1) {
      failures.push(`${key}: expected 1 credential account, found ${credentials.length}`);
      continue;
    }
    const [credential] = credentials;
    expectEqual(failures, `${key}.account.id`, credential.id, `${id}-credential`);
    expectEqual(failures, `${key}.account.accountId`, credential.accountId, id);
    if (!credential.password?.startsWith('$2')) {
      failures.push(`${key}: credential password hash missing or not bcrypt`);
    }
  }
}

async function collectRelationshipViolations(
  db: AssertDb,
  schema: AssertSchema,
  failures: string[]
) {
  const cases = Object.entries(E2E_CASE_FIXTURES);
  const caseRows = await Promise.all(
    cases.map(([, expected]) =>
      db.query.claims.findFirst({
        where: eq(schema.claims.id, expected.id),
        columns: { tenantId: true, branchId: true, userId: true, agentId: true, staffId: true },
      })
    )
  );
  for (const [index, [name, expected]] of cases.entries()) {
    const row = caseRows[index];
    if (!row) {
      failures.push(`case ${name}: ${expected.id} missing`);
      continue;
    }
    expectEqual(failures, `case ${name}.tenantId`, row.tenantId, expected.tenantId);
    expectEqual(failures, `case ${name}.branchId`, row.branchId, expected.branchId);
    expectEqual(failures, `case ${name}.userId`, row.userId, expected.ownerUserId);
    expectEqual(failures, `case ${name}.agentId`, row.agentId, expected.agentId);
    expectEqual(failures, `case ${name}.staffId`, row.staffId, expected.staffId);
  }

  const links = Object.entries(E2E_AGENT_LINK_FIXTURES);
  const linkRows = await Promise.all(
    links.map(([, expected]) =>
      db.query.agentClients.findFirst({
        where: eq(schema.agentClients.id, expected.id),
        columns: { tenantId: true, agentId: true, memberId: true, status: true },
      })
    )
  );
  for (const [index, [name, expected]] of links.entries()) {
    const row = linkRows[index];
    if (!row) {
      failures.push(`agent link ${name}: ${expected.id} missing`);
      continue;
    }
    expectEqual(failures, `link ${name}.tenantId`, row.tenantId, expected.tenantId);
    expectEqual(failures, `link ${name}.agentId`, row.agentId, expected.agentId);
    expectEqual(failures, `link ${name}.memberId`, row.memberId, expected.memberId);
    expectEqual(failures, `link ${name}.status`, row.status, expected.status);
  }

  const forbiddenActiveLinks = [
    {
      label: 'inactive-link agent has no active link to its former client',
      agentId: E2E_AGENT_LINK_FIXTURES.KS_INACTIVE.agentId,
      memberId: E2E_AGENT_LINK_FIXTURES.KS_INACTIVE.memberId,
    },
    {
      label: "PILOT_MK_AGENT has no active link to PILOT_MK_AGENT_2's client",
      agentId: E2E_USER_IDS.PILOT_MK_AGENT,
      memberId: E2E_AGENT_LINK_FIXTURES.PILOT_OTHER_AGENT_CLIENT.memberId,
    },
    {
      label: 'inactive-link agent has no active link to the anchor case owner',
      agentId: E2E_USER_IDS.KS_AGENT_INACTIVE_LINK,
      memberId: E2E_CASE_FIXTURES.KS_ANCHOR.ownerUserId,
    },
  ];
  const activeLinks = await Promise.all(
    forbiddenActiveLinks.map(link =>
      db.query.agentClients.findFirst({
        where: and(
          eq(schema.agentClients.agentId, link.agentId),
          eq(schema.agentClients.memberId, link.memberId),
          eq(schema.agentClients.status, 'active')
        ),
        columns: { id: true },
      })
    )
  );
  forbiddenActiveLinks.forEach((link, index) => {
    if (activeLinks[index]) failures.push(`relationship violated: ${link.label}`);
  });

  const unassignedStaff = await db.query.user.findFirst({
    where: eq(schema.user.id, E2E_USER_IDS.KS_STAFF_UNASSIGNED),
    columns: { branchId: true, tenantId: true },
  });
  expectEqual(failures, 'KS_STAFF_UNASSIGNED.branchId', unassignedStaff?.branchId, null);
  expectEqual(
    failures,
    'KS_STAFF_UNASSIGNED shares the anchor tenant',
    unassignedStaff?.tenantId,
    E2E_CASE_FIXTURES.KS_ANCHOR.tenantId
  );

  const messages = Object.entries(E2E_MESSAGE_FIXTURES);
  const messageRows = await Promise.all(
    messages.map(([, expected]) =>
      db.query.claimMessages.findFirst({
        where: eq(schema.claimMessages.id, expected.id),
        columns: { tenantId: true, claimId: true, senderId: true, isInternal: true },
      })
    )
  );
  for (const [index, [name, expected]] of messages.entries()) {
    const row = messageRows[index];
    if (!row) {
      failures.push(`message ${name}: ${expected.id} missing`);
      continue;
    }
    expectEqual(failures, `message ${name}.tenantId`, row.tenantId, expected.tenantId);
    expectEqual(failures, `message ${name}.claimId`, row.claimId, expected.claimId);
    expectEqual(failures, `message ${name}.senderId`, row.senderId, expected.senderId);
    expectEqual(failures, `message ${name}.isInternal`, row.isInternal, expected.isInternal);
  }
}

/** Database check: the role matrix and named relationships exist with the exact expected shape. */
export async function collectRoleFixtureViolations(
  db: AssertDb,
  schema: AssertSchema
): Promise<string[]> {
  const failures = collectRoleCatalogueViolations();
  await collectUserViolations(db, schema, failures);
  await collectRelationshipViolations(db, schema, failures);
  return failures;
}
