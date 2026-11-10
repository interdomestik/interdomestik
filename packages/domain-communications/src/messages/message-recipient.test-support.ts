import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asActor } from './message-rls-actors.test-support';
import {
  expectMessageContextCleared,
  expectOnlyReceiptChanges,
  messageEffects,
} from './message-rls-effects.test-support';
import { fixture, homeTenantId, ids, session } from './tenant-context.integration-fixture';

const otherClaim = `${ids.claim}_recipient_scope`;
const recipients = [
  { role: 'member', id: ids.member, internal: false },
  { role: 'user', id: ids.member, internal: false },
  { role: 'agent', id: ids.agent, internal: false },
  { role: 'staff', id: ids.otherMember, internal: true },
] as const;

/** Registered inside the existing required tenant-context suite, sharing its LOGIN and fixtures. */
export function registerRecipientBatchCases(): void {
  describe('mixed recipient acknowledgement batches', () => {
    beforeAll(async () => {
      const { dbAdmin, claims } = fixture.database;
      const source = await dbAdmin.query.claims.findFirst({ where: eq(claims.id, ids.claim) });
      if (!source) throw new Error('Missing recipient claim fixture');
      await dbAdmin.insert(claims).values({
        ...source,
        id: otherClaim,
        userId: ids.otherMember,
        staffId: ids.member,
        branchId: ids.otherBranch,
      });
    });
    afterAll(async () => {
      const { dbAdmin, claimMessages, claims } = fixture.database;
      await dbAdmin.delete(claimMessages).where(eq(claimMessages.claimId, otherClaim));
      await dbAdmin.delete(claims).where(eq(claims.id, otherClaim));
    });

    it.each(recipients)('$role updates only eligible rows in a mixed-id batch', async row => {
      const { dbAdmin, claimMessages } = fixture.database;
      const ownId = `${ids.claim}_${row.role}_own`;
      const otherId = `${ids.claim}_${row.role}_other`;
      const missingId = `${ids.claim}_missing`;
      const batch = [ids.public, ids.internal, ownId, otherId, missingId];
      await dbAdmin
        .update(claimMessages)
        .set({ readAt: null })
        .where(inArray(claimMessages.id, [ids.public, ids.internal]));
      await dbAdmin.insert(claimMessages).values(
        [
          { id: ownId, claimId: ids.claim, senderId: row.id, content: 'Own sent message' },
          { id: otherId, claimId: otherClaim, senderId: ids.staff, content: 'Other case message' },
        ].map(message => ({ ...message, tenantId: homeTenantId, isInternal: false }))
      );
      try {
        const before = await messageEffects();
        const actor = {
          ...asActor(row.id, row.role),
          session: session(row.id, row.role, homeTenantId, ids.agentBranch),
        };
        expect(await fixture.markRead({ ...actor, messageIds: batch })).toEqual({ success: true });
        const after = await messageEffects();
        const eligible = row.internal ? [ids.public, ids.internal] : [ids.public];
        expectOnlyReceiptChanges(before, after, eligible);
        await expectMessageContextCleared();
        // Repeating the batch must preserve the original receipt timestamps exactly.
        expect(await fixture.markRead({ ...actor, messageIds: batch })).toEqual({ success: true });
        expect(await messageEffects()).toEqual(after);
        await expectMessageContextCleared();
      } finally {
        await dbAdmin.delete(claimMessages).where(inArray(claimMessages.id, [ownId, otherId]));
        // Later cases in the shared suite expect the seeded thread to start unread.
        await dbAdmin
          .update(claimMessages)
          .set({ readAt: null })
          .where(inArray(claimMessages.id, [ids.public, ids.internal]));
      }
    });
  });
}
