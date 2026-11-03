import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  fixture,
  ids,
  homeTenantId,
  otherTenantId,
  session,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';
import { asActor } from './message-rls-actors.test-support';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
const branchClaim = `${ids.claim}_branch`;
const unreadMessage = `${ids.claim}_unread`;
const DENIED = 'Access denied';

type Actor = { id: string; role: string; tenantId?: string; branchId?: string | null };

const sendAs = (actor: Actor, claimId: string, content: string, isInternal = false) =>
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
  });

suite('message send negative matrix on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();

  // Nested, so this cleanup always runs before the shared fixture removes users and branches.
  describe('with a branch-owned unassigned claim', () => {
    beforeAll(async () => {
      await fixture.database.dbAdmin.insert(fixture.database.claims).values({
        id: branchClaim,
        userId: ids.member,
        tenantId: homeTenantId,
        branchId: ids.otherBranch,
        category: 'retail',
        companyName: 'Synthetic Co',
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
    });

    it('denies each out-of-scope send with its own error, writes nothing and resets context', async () => {
      // The branch-manager row is the claim owner, so only the branch-manager rule can deny it.
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
        [{ id: ids.staff, role: 'staff', branchId: ids.agentBranch }, branchClaim, false, DENIED],
        [
          { id: ids.agent, role: 'agent' },
          branchClaim,
          false,
          `${DENIED}: You can only message your assigned clients`,
        ],
        [
          { id: ids.agent, role: 'agent' },
          ids.claim,
          true,
          'Only staff can send internal messages',
        ],
      ];
      for (const [index, [actor, claimId, isInternal, error]] of cases.entries()) {
        const result = await sendAs(actor, claimId, `Denied send ${index}`, isInternal);
        expect(result, `case ${index}`).toEqual({ success: false, error });
      }

      const leaked = await fixture.database.dbAdmin.query.claimMessages.findMany({
        where: like(fixture.database.claimMessages.content, 'Denied send %'),
      });
      expect(leaked).toEqual([]);
      const [context] = await fixture.database.dbRls.execute(
        fixture.database.sql`select current_setting('app.current_tenant_id',true) as tenant`
      );
      expect(context.tenant || null).toBeNull();

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

      await fixture.markRead({
        ...asActor(ids.member, 'member', otherTenantId),
        messageIds: [unreadMessage],
      });
      expect(await readAt()).toBeNull();

      await fixture.markRead({ ...asActor(ids.member, 'member'), messageIds: [unreadMessage] });
      expect(await readAt()).toBeInstanceOf(Date);
    });
  });
});
