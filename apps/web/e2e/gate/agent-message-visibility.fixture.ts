import {
  account,
  agentClients,
  branches,
  claimMessages,
  claims,
  dbAdmin,
  E2E_USERS,
  memberNotes,
  user,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { loadSyntheticMessagePasswords } from './agent-message-credentials.fixture';
import { cleanupAgentMessageFixture } from './agent-message-cleanup.fixture';
import {
  planProfileChildren,
  seedProfileChildren,
  type ProfileChildFixture,
} from './agent-profile-children.fixture';

/** Synthetic identities only; safe to serialize to the restricted-role reader child. */
export interface AgentMessageFixture {
  agentId: string;
  agentName: string;
  branchId: string;
  email: string;
  memberEmail: string;
  staffId: string;
  staffEmail: string;
  tenantId: string;
  foreignTenantId: string;
  memberId: string;
  inactiveMemberId: string;
  unassignedMemberId: string;
  claimIds: string[];
  deniedIds: string[];
  /**
   * Rightful own-member notes in expected read order: pinned internal first, then the newer
   * staff-authored public note, then the older agent-authored public note.
   */
  rightfulNoteIds: string[];
  foreignNoteId: string;
  /** Profile child rows, empty-member and foreign-tenant controls, and the same-tenant staff author. */
  children: ProfileChildFixture;
}

// dbAdmin is used for fixture setup and cleanup only; assertions run under a restricted role.
export async function withAgentMessageFixture<T>(
  projectName: string,
  action: (fixture: AgentMessageFixture) => Promise<T>
): Promise<T> {
  const isMk = projectName.includes('mk');
  const email = isMk ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
  const seededAgent = await dbAdmin.query.user.findFirst({ where: eq(user.email, email) });
  if (!seededAgent?.tenantId) throw new Error(`Missing seeded agent: ${email}`);
  const tenantId = seededAgent.tenantId;
  const foreignTenantId = isMk ? 'tenant_ks' : 'tenant_mk';
  const prefix = `s1-${randomUUID()}`;
  const agent = {
    id: `${prefix}-agent`,
    branchId: `${prefix}-branch`,
    email: `${prefix}@example.com`,
  };
  const credential = await dbAdmin.query.account.findFirst({
    where: and(eq(account.userId, seededAgent.id), eq(account.providerId, 'credential')),
  });
  if (!credential?.password) throw new Error('Missing seeded agent credential');
  const { memberPassword, staffPassword } = await loadSyntheticMessagePasswords(isMk);
  const memberIds = ['active', 'inactive', 'unassigned'].map(name => `${prefix}-${name}`);
  const assignmentIds = ['active', 'inactive'].map(name => `${prefix}-assignment-${name}`);
  const claimIds = Array.from({ length: 105 }, (_, index) => `${prefix}-claim-${index}`);
  const deniedIds = ['foreign', 'inactive', 'unassigned'].map(name => `${prefix}-${name}-claim`);
  const allClaimIds = [...claimIds, ...deniedIds];
  const noteIds = ['pinned', 'recent', 'inactive', 'unassigned', 'foreign'].map(
    name => `${prefix}-note-${name}`
  );
  const children = planProfileChildren(prefix);
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
  const note = (
    index: number,
    memberId: string,
    content: string,
    overrides: Partial<typeof memberNotes.$inferInsert> = {}
  ): typeof memberNotes.$inferInsert => ({
    id: noteIds[index],
    tenantId,
    memberId,
    authorId: agent.id,
    content,
    createdAt: date(index + 1),
    ...overrides,
  });
  try {
    await dbAdmin
      .insert(branches)
      .values({ id: agent.branchId, tenantId, name: prefix, slug: prefix });
    await dbAdmin.insert(user).values({
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
    await dbAdmin.insert(account).values({
      id: `${prefix}-credential`,
      accountId: agent.email,
      providerId: 'credential',
      userId: agent.id,
      password: credential.password,
      createdAt: date(0),
      updatedAt: date(0),
    });
    await dbAdmin.insert(user).values(
      memberIds.map((id, index) => ({
        id,
        tenantId,
        name: id,
        email: `${id}@example.com`,
        role: 'member',
        emailVerified: true,
        branchId: agent.branchId,
        // Legacy agent projection relation: only the admitted main member points at the agent.
        agentId: index === 0 ? agent.id : null,
        createdAt: date(0),
        updatedAt: date(0),
      }))
    );
    await dbAdmin.insert(agentClients).values(
      assignmentIds.map((id, index) => ({
        id,
        tenantId,
        agentId: agent.id,
        memberId: memberIds[index],
        status: index === 0 ? 'active' : 'inactive',
      }))
    );
    // The first claim is assigned to this synthetic staff user, so create the
    // profile child users before inserting claims with a staff foreign key.
    await seedProfileChildren(
      {
        tenantId,
        foreignTenantId,
        agentId: agent.id,
        mainMemberId: memberIds[0],
        branchId: agent.branchId,
      },
      children
    );
    await dbAdmin.insert(claims).values(
      allClaimIds.map((id, index) => ({
        id,
        tenantId: id === deniedIds[0] ? foreignTenantId : tenantId,
        userId: deniedOwners[id] ?? memberIds[0],
        branchId: agent.branchId,
        staffId: index === 0 ? children.staffAuthorId : null,
        title: id,
        claimNumber: id,
        companyName: 'S1 synthetic fixture',
        category: 'vehicle',
        ...claimLifecycleFieldsForStatus('submitted'),
        createdAt: date(200 - index),
        updatedAt: date(200 - index),
      }))
    );
    await dbAdmin
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
    await dbAdmin.insert(memberNotes).values([
      note(0, memberIds[0], 'S8 pinned internal old note', { isPinned: true, isInternal: true }),
      note(1, memberIds[0], 'S8 recent public note', { isPinned: false, isInternal: false }),
      note(2, memberIds[1], 'S8 inactive member note'),
      note(3, memberIds[2], 'S8 unassigned member note'),
      // Adversarial tenant-isolation control: same own member, other tenant.
      note(4, memberIds[0], 'S8 foreign tenant note', { tenantId: foreignTenantId }),
    ]);
    await dbAdmin.insert(account).values([
      {
        id: `${prefix}-member-credential`,
        accountId: `${memberIds[0]}@example.com`,
        providerId: 'credential',
        userId: memberIds[0],
        password: memberPassword,
        createdAt: date(0),
        updatedAt: date(0),
      },
      {
        id: `${prefix}-staff-credential`,
        accountId: `${children.staffAuthorId}@example.com`,
        providerId: 'credential',
        userId: children.staffAuthorId,
        password: staffPassword,
        createdAt: date(0),
        updatedAt: date(0),
      },
    ]);
    return await action({
      agentId: agent.id,
      agentName: prefix,
      branchId: agent.branchId,
      email: agent.email,
      memberEmail: `${memberIds[0]}@example.com`,
      staffId: children.staffAuthorId,
      staffEmail: `${children.staffAuthorId}@example.com`,
      tenantId,
      foreignTenantId,
      memberId: memberIds[0],
      inactiveMemberId: memberIds[1],
      unassignedMemberId: memberIds[2],
      claimIds,
      deniedIds,
      rightfulNoteIds: [noteIds[0], children.staffNoteId, noteIds[1]],
      foreignNoteId: noteIds[4],
      children,
    });
  } finally {
    await cleanupAgentMessageFixture({
      agent,
      allClaimIds,
      assignmentIds,
      children,
      memberIds,
      noteIds,
      tenantId,
    });
  }
}
