import {
  account,
  agentClients,
  branches,
  claimMessages,
  claims,
  db,
  E2E_USERS,
  session,
  user,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function withAgentMessageFixture<T>(
  projectName: string,
  action: (fixture: {
    agentId: string;
    email: string;
    tenantId: string;
    claimIds: string[];
    deniedIds: string[];
  }) => Promise<T>
): Promise<T> {
  const isMk = projectName.includes('mk');
  const email = isMk ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
  const seededAgent = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (!seededAgent?.tenantId) throw new Error(`Missing seeded agent: ${email}`);
  const tenantId = seededAgent.tenantId;
  const foreignTenantId = isMk ? 'tenant_ks' : 'tenant_mk';
  const prefix = `s1-${randomUUID()}`;
  const agent = {
    id: `${prefix}-agent`,
    branchId: `${prefix}-branch`,
    email: `${prefix}@example.com`,
  };
  const credential = await db.query.account.findFirst({
    where: and(eq(account.userId, seededAgent.id), eq(account.providerId, 'credential')),
  });
  if (!credential?.password) throw new Error('Missing seeded agent credential');
  const memberIds = ['active', 'inactive', 'unassigned'].map(name => `${prefix}-${name}`);
  const assignmentIds = ['active', 'inactive'].map(name => `${prefix}-assignment-${name}`);
  const claimIds = Array.from({ length: 105 }, (_, index) => `${prefix}-claim-${index}`);
  const deniedIds = ['foreign', 'inactive', 'unassigned'].map(name => `${prefix}-${name}-claim`);
  const allClaimIds = [...claimIds, ...deniedIds];
  const deniedOwners: Record<string, string> = {
    [deniedIds[1]]: memberIds[1],
    [deniedIds[2]]: memberIds[2],
  };
  const date = (index: number) => new Date(Date.UTC(2099, 0, 1, 0, 0, index));
  const message = (
    claimId: string,
    content: string,
    index: number,
    overrides: Partial<typeof claimMessages.$inferInsert> = {}
  ): typeof claimMessages.$inferInsert => ({
    id: `${prefix}-message-${index}`,
    tenantId,
    claimId,
    senderId: memberIds[0],
    content,
    isInternal: false,
    readAt: null,
    createdAt: date(index),
    ...overrides,
  });
  try {
    await db.insert(branches).values({ id: agent.branchId, tenantId, name: prefix, slug: prefix });
    await db.insert(user).values({
      id: agent.id,
      tenantId,
      name: prefix,
      email: agent.email,
      role: 'agent',
      emailVerified: true,
      branchId: agent.branchId,
      createdAt: date(0),
      updatedAt: date(0),
    });
    await db.insert(account).values({
      id: `${prefix}-credential`,
      accountId: agent.email,
      providerId: 'credential',
      userId: agent.id,
      password: credential.password,
      createdAt: date(0),
      updatedAt: date(0),
    });
    await db.insert(user).values(
      memberIds.map(id => ({
        id,
        tenantId,
        name: id,
        email: `${id}@example.com`,
        role: 'member',
        emailVerified: true,
        branchId: agent.branchId,
        createdAt: date(0),
        updatedAt: date(0),
      }))
    );
    await db.insert(agentClients).values(
      assignmentIds.map((id, index) => ({
        id,
        tenantId,
        agentId: agent.id,
        memberId: memberIds[index],
        status: index === 0 ? 'active' : 'inactive',
      }))
    );
    await db.insert(claims).values(
      allClaimIds.map((id, index) => ({
        id,
        tenantId: id === deniedIds[0] ? foreignTenantId : tenantId,
        userId: deniedOwners[id] ?? memberIds[0],
        branchId: agent.branchId,
        title: id,
        claimNumber: id,
        companyName: 'S1 synthetic fixture',
        category: 'vehicle',
        ...claimLifecycleFieldsForStatus('submitted'),
        createdAt: date(200 - index),
        updatedAt: date(200 - index),
      }))
    );
    await db
      .insert(claimMessages)
      .values([
        message(claimIds[0], 'S1 old internal', 1, { isInternal: true }),
        message(claimIds[0], 'S1 public read', 2, { readAt: date(3) }),
        message(claimIds[0], 'S1 public incoming', 4),
        message(claimIds[0], 'S1 public agent reply', 5, { senderId: agent.id }),
        message(claimIds[0], 'S1 newest internal secret', 6, { isInternal: true }),
        message(claimIds[1], 'S1 internal only secret', 7, { isInternal: true }),
        message(claimIds[3], 'S1 unspecified visibility', 8, { isInternal: null }),
        message(claimIds[104], 'S1 selected public', 9),
        message(claimIds[104], 'S1 selected internal secret', 10, { isInternal: true }),
        message(deniedIds[0], 'S1 foreign claim secret', 11, { tenantId: foreignTenantId }),
        message(deniedIds[1], 'S1 inactive assignment secret', 12),
        message(deniedIds[2], 'S1 unassigned secret', 13),
        message(claimIds[0], 'S1 foreign message secret', 14, { tenantId: foreignTenantId }),
      ]);
    return await action({ agentId: agent.id, email: agent.email, tenantId, claimIds, deniedIds });
  } finally {
    await db.delete(claimMessages).where(inArray(claimMessages.claimId, allClaimIds));
    await db.delete(claims).where(inArray(claims.id, allClaimIds));
    await db.delete(agentClients).where(inArray(agentClients.id, assignmentIds));
    await db.delete(user).where(inArray(user.id, memberIds));
    await db.delete(session).where(eq(session.userId, agent.id));
    await db.delete(account).where(eq(account.userId, agent.id));
    await db.delete(user).where(eq(user.id, agent.id));
    await db.delete(branches).where(eq(branches.id, agent.branchId));
  }
}
