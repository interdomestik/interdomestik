import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray, like } from 'drizzle-orm';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';
import {
  fixture,
  ids,
  homeTenantId,
  otherTenantId,
  session,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';
import { asActor } from './message-rls-actors.test-support';
import {
  expectMessageContextCleared,
  expectOnlyReceiptChanges,
  expectRoleSend,
  messageEffects,
} from './message-rls-effects.test-support';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
const branchClaim = `${ids.claim}_branch`;
const unreadMessage = `${ids.claim}_unread`;
// Same tenant and branch as the linked agent; one has an inactive link, the other none.
const inactiveAgent = `${ids.agent}_inactive`;
const unlinkedAgent = `${ids.agent}_unlinked`;
const inactiveLink = `${ids.link}_inactive`;
const AGENT_DENIED = 'Access denied: You can only message your assigned clients';
const DENIED = 'Access denied';

// Literal expectations, independent of the permission helpers being exercised. Read-only owners
// retain ownership deliberately; full-tenant roles use a nonowner. `user` is the legacy alias.
const roles = [
  { role: 'member', id: ids.member, read: true, write: true, internal: false },
  { role: 'user', id: ids.member, read: true, write: true, internal: false },
  { role: 'agent', id: ids.agent, read: true, write: true, internal: false },
  { role: 'staff', id: ids.otherMember, read: true, write: true, internal: true },
  { role: 'branch_manager', id: ids.member, read: true, write: false, internal: true },
  { role: 'admin', id: ids.otherMember, read: true, write: true, internal: true },
  { role: 'tenant_admin', id: ids.otherMember, read: true, write: true, internal: true },
  { role: 'super_admin', id: ids.otherMember, read: true, write: true, internal: true },
  { role: 'auditor', id: ids.member, read: false, write: false, internal: false },
  { role: 'global_support', id: ids.member, read: true, write: false, internal: false },
] as const;

type Actor = { id: string; role: string; tenantId?: string; branchId?: string | null };

const sendAs = (
  actor: Actor,
  claimId: string,
  content: string,
  isInternal = false,
  audit = vi.fn()
) =>
  fixture.send({
    session: session(actor.id, actor.role, actor.tenantId, actor.branchId ?? null),
    authority: mintTestTenantAuthority(actor.tenantId ?? homeTenantId, {
      userId: actor.id,
      role: actor.role,
    }),
    requestHeaders: new Headers(),
    claimId,
    content,
    isInternal,
    deps: { logAuditEvent: audit },
  });

suite('message send negative matrix on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();

  it('covers the full permission catalogue plus the legacy member alias', () => {
    const catalogueRoles = roles.map(row => row.role).filter(role => role !== 'user');
    expect(new Set(catalogueRoles)).toEqual(new Set(Object.values(ROLES)));
    expect(roles).toHaveLength(catalogueRoles.length + 1);
  });

  it.each(roles)('$role: history, send and mark-read with zero denied effects', async row => {
    const actor = {
      ...asActor(row.id, row.role),
      session: session(row.id, row.role, homeTenantId, ids.agentBranch),
    };
    const { dbAdmin, claimMessages } = fixture.database;
    await dbAdmin
      .update(claimMessages)
      .set({ readAt: null })
      .where(inArray(claimMessages.id, [ids.public, ids.internal]));
    const before = await messageEffects();
    const history = await fixture.get({ ...actor, claimId: ids.claim });
    expect(history.success).toBe(row.read);
    if (row.read) {
      expect(history.canAcknowledge).toBe(row.write);
      expect(history.messages?.some(message => message.id === ids.public)).toBe(true);
      expect(history.messages?.some(message => message.id === ids.internal)).toBe(row.internal);
    } else {
      expect(history).toEqual({ success: false, error: DENIED });
    }
    expect(await messageEffects()).toEqual(before);
    await expectMessageContextCleared();

    const send = {
      ...actor,
      claimId: ids.claim,
      requestHeaders: new Headers(),
      content: `Role matrix ${row.role}`,
    };
    await expectRoleSend(send, row.write);
    await expectRoleSend(
      { ...send, isInternal: true },
      row.write && row.internal,
      row.write ? 'Only staff can send internal messages' : DENIED
    );

    const beforeReceipt = await messageEffects();
    const receipt = await fixture.markRead({ ...actor, messageIds: [ids.public, ids.internal] });
    expect(receipt).toEqual(row.write ? { success: true } : { success: false, error: DENIED });
    const afterReceipt = await messageEffects();
    const eligible = row.internal ? [ids.public, ids.internal] : [ids.public];
    expectOnlyReceiptChanges(beforeReceipt, afterReceipt, row.write ? eligible : []);
    await expectMessageContextCleared();
  });

  // Nested, so this cleanup always runs before the shared fixture removes users and branches.
  describe('with a branch-owned unassigned claim and unlinked agents', () => {
    beforeAll(async () => {
      const now = new Date();
      await fixture.database.dbAdmin.insert(fixture.database.user).values(
        [inactiveAgent, unlinkedAgent].map(id => ({
          id,
          role: 'agent',
          tenantId: homeTenantId,
          email: `${id}@example.test`,
          emailVerified: true,
          name: 'Synthetic Agent',
          branchId: ids.agentBranch,
          createdAt: now,
          updatedAt: now,
        }))
      );
      await fixture.database.dbAdmin.insert(fixture.database.agentClients).values({
        id: inactiveLink,
        tenantId: homeTenantId,
        agentId: inactiveAgent,
        memberId: ids.member,
        status: 'inactive',
      });
      await fixture.database.dbAdmin.insert(fixture.database.claims).values({
        id: branchClaim,
        userId: ids.member,
        tenantId: homeTenantId,
        branchId: ids.otherBranch,
        category: 'retail',
        companyName: 'Synthetic Co',
        // Submitted work: staff scopes exclude member drafts (the column default).
        caseLifecycleState: 'submitted',
        description: 'Branch-scoped message negative matrix',
        origin: 'portal',
        title: 'Synthetic branch case',
      });
    });

    afterAll(async () => {
      await fixture.database.dbAdmin
        .delete(fixture.database.claimMessages)
        .where(eq(fixture.database.claimMessages.claimId, branchClaim));
      await fixture.database.dbAdmin
        .delete(fixture.database.claims)
        .where(eq(fixture.database.claims.id, branchClaim));
      await fixture.database.dbAdmin
        .delete(fixture.database.agentClients)
        .where(eq(fixture.database.agentClients.id, inactiveLink));
      await fixture.database.dbAdmin
        .delete(fixture.database.user)
        .where(inArray(fixture.database.user.id, [inactiveAgent, unlinkedAgent]));
    });

    // The branch-manager row is the claim owner, so only the branch-manager rule can deny it.
    // The agent rows on the branchless claim are decided by the link alone; the branch-claim row
    // has an active link, so only its branch denies it.
    const cases: ReadonlyArray<readonly [Actor, string, boolean, string]> = [
      [
        { id: ids.member, role: 'member', tenantId: otherTenantId },
        ids.claim,
        false,
        'Claim not found',
      ],
      [{ id: ids.otherMember, role: 'member' }, ids.claim, false, DENIED],
      [{ id: ids.otherMember, role: 'staff' }, ids.claim, false, DENIED],
      [{ id: ids.member, role: 'branch_manager' }, ids.claim, false, DENIED],
      [{ id: ids.member, role: 'auditor' }, ids.claim, false, DENIED],
      [{ id: ids.member, role: 'global_support' }, ids.claim, false, DENIED],
      [{ id: ids.staff, role: 'staff', branchId: ids.agentBranch }, branchClaim, false, DENIED],
      [{ id: ids.agent, role: 'agent' }, branchClaim, false, AGENT_DENIED],
      [{ id: inactiveAgent, role: 'agent' }, ids.claim, false, AGENT_DENIED],
      [{ id: unlinkedAgent, role: 'agent' }, ids.claim, false, AGENT_DENIED],
      [{ id: ids.agent, role: 'agent' }, ids.claim, true, 'Only staff can send internal messages'],
    ];
    it.each(cases)(
      'denies out-of-scope send %# with zero effects and resets context',
      async (actor, claimId, isInternal, error) => {
        const before = await messageEffects();
        const audit = vi.fn();
        const result = await sendAs(actor, claimId, `Denied send ${actor.id}`, isInternal, audit);
        expect(result).toEqual({ success: false, error });
        expect(audit).not.toHaveBeenCalled();
        expect(await messageEffects()).toEqual(before);
        await expectMessageContextCleared();

        const leaked = await fixture.database.dbAdmin.query.claimMessages.findMany({
          where: like(fixture.database.claimMessages.content, 'Denied send %'),
        });
        expect(leaked).toEqual([]);
        const [context] = await fixture.database.dbRls.execute(
          fixture.database.sql`select current_setting('app.current_tenant_id',true) as tenant`
        );
        expect(context.tenant || null).toBeNull();
      }
    );

    it('admits the matching branch and active-link controls', async () => {
      // Controls: the same branch, link and audience rules admit the matching actor.
      const inBranch = { id: ids.staff, role: 'staff', branchId: ids.otherBranch };
      expect(await sendAs(inBranch, branchClaim, 'Allowed branch send')).toMatchObject({
        success: true,
      });
      const linkedAgent = { id: ids.agent, role: 'agent' };
      expect(await sendAs(linkedAgent, ids.claim, 'Allowed agent send')).toMatchObject({
        success: true,
      });
    });

    it('leaves a message unread when a foreign-tenant actor marks it read', async () => {
      await fixture.database.dbAdmin.insert(fixture.database.claimMessages).values({
        id: unreadMessage,
        tenantId: homeTenantId,
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Unread public update',
        isInternal: false,
      });
      const readAt = async () =>
        (
          await fixture.database.dbAdmin.query.claimMessages.findFirst({
            where: eq(fixture.database.claimMessages.id, unreadMessage),
          })
        )?.readAt;

      const before = await messageEffects();
      // Deliberate contract: out-of-scope ids report success with zero updated rows.
      expect(
        await fixture.markRead({
          ...asActor(ids.member, 'member', otherTenantId),
          messageIds: [unreadMessage],
        })
      ).toEqual({ success: true });
      expect(await readAt()).toBeNull();
      expect(await messageEffects()).toEqual(before);
      await expectMessageContextCleared();

      await fixture.markRead({ ...asActor(ids.member, 'member'), messageIds: [unreadMessage] });
      expect(await readAt()).toBeInstanceOf(Date);
    });
  });
});
