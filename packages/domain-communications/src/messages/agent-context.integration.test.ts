import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  fixture,
  ids,
  homeTenantId,
  otherTenantId,
  session,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';
const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
suite('message operations on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();
  it('uses the current agent branch for read, send and receipts despite a cached null branch', async () => {
    const wrongBranchMessageId = `${ids.public}_wrong_branch`;
    const agentSession = session(ids.agent, 'agent', homeTenantId, null);
    const existing = await fixture.get({ session: agentSession, claimId: ids.claim });
    expect(existing.messages?.map(message => message.id)).toContain(ids.public);
    try {
      await fixture.database.dbAdmin
        .update(fixture.database.claims)
        .set({ branchId: ids.agentBranch })
        .where(eq(fixture.database.claims.id, ids.claim));
      const sameBranch = await fixture.get({ session: agentSession, claimId: ids.claim });
      expect(sameBranch.messages?.map(message => message.id)).toContain(ids.public);
      await fixture.database.dbAdmin
        .update(fixture.database.claims)
        .set({ branchId: ids.otherBranch })
        .where(eq(fixture.database.claims.id, ids.claim));
      await fixture.database.dbAdmin.insert(fixture.database.claimMessages).values({
        id: wrongBranchMessageId,
        tenantId: homeTenantId,
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Wrong branch public receipt control',
        isInternal: false,
      });
      expect(await fixture.get({ session: agentSession, claimId: ids.claim })).toMatchObject({
        success: false,
      });
      expect(
        await fixture.send({
          session: agentSession,
          requestHeaders: new Headers(),
          claimId: ids.claim,
          content: 'Wrong branch agent message must be denied',
        })
      ).toMatchObject({ success: false });
      expect(
        await fixture.markRead({ session: agentSession, messageIds: [wrongBranchMessageId] })
      ).toEqual({ success: true });
      const persisted = await fixture.database.dbAdmin.query.claimMessages.findFirst({
        where: eq(fixture.database.claimMessages.id, wrongBranchMessageId),
      });
      expect(persisted?.readAt).toBeNull();
      const forbiddenSend = await fixture.database.dbAdmin.query.claimMessages.findMany({
        where: eq(fixture.database.claimMessages.claimId, ids.claim),
      });
      expect(
        forbiddenSend.some(
          message => message.content === 'Wrong branch agent message must be denied'
        )
      ).toBe(false);
    } finally {
      await fixture.database.dbAdmin
        .delete(fixture.database.claimMessages)
        .where(eq(fixture.database.claimMessages.id, wrongBranchMessageId));
      await fixture.database.dbAdmin
        .update(fixture.database.claims)
        .set({ branchId: null })
        .where(eq(fixture.database.claims.id, ids.claim));
    }
  });
  it('denies conversation operations when the agent has no current identity in the access tenant', async () => {
    const receiptId = `${ids.public}_missing_identity`;
    await fixture.database.dbAdmin.insert(fixture.database.claimMessages).values({
      id: receiptId,
      tenantId: homeTenantId,
      claimId: ids.claim,
      senderId: ids.staff,
      content: 'Current identity receipt control',
      isInternal: false,
    });
    try {
      await fixture.database.dbAdmin
        .update(fixture.database.user)
        .set({ tenantId: otherTenantId })
        .where(eq(fixture.database.user.id, ids.agent));
      const actor = session(ids.agent, 'agent');
      expect(await fixture.get({ session: actor, claimId: ids.claim })).toMatchObject({
        success: false,
      });
      expect(
        await fixture.send({
          session: actor,
          requestHeaders: new Headers(),
          claimId: ids.claim,
          content: 'Missing current agent must not send',
        })
      ).toMatchObject({ success: false });
      expect(await fixture.markRead({ session: actor, messageIds: [receiptId] })).toMatchObject({
        success: false,
      });
      const messages = await fixture.database.dbAdmin.query.claimMessages.findMany({
        where: eq(fixture.database.claimMessages.claimId, ids.claim),
      });
      expect(messages.find(message => message.id === receiptId)?.readAt).toBeNull();
      expect(
        messages.some(message => message.content === 'Missing current agent must not send')
      ).toBe(false);
    } finally {
      await fixture.database.dbAdmin
        .update(fixture.database.user)
        .set({ tenantId: homeTenantId })
        .where(eq(fixture.database.user.id, ids.agent));
      await fixture.database.dbAdmin
        .delete(fixture.database.claimMessages)
        .where(eq(fixture.database.claimMessages.id, receiptId));
    }
  });
  it('retains the legitimate current-null-branch agent policy across conversation operations', async () => {
    const receiptId = `${ids.public}_null_branch`;
    let createdMessageId: string | undefined;
    await fixture.database.dbAdmin.insert(fixture.database.claimMessages).values({
      id: receiptId,
      tenantId: homeTenantId,
      claimId: ids.claim,
      senderId: ids.staff,
      content: 'Null branch receipt control',
      isInternal: false,
    });
    try {
      await fixture.database.dbAdmin
        .update(fixture.database.user)
        .set({ branchId: null })
        .where(eq(fixture.database.user.id, ids.agent));
      await fixture.database.dbAdmin
        .update(fixture.database.claims)
        .set({ branchId: ids.otherBranch })
        .where(eq(fixture.database.claims.id, ids.claim));
      const actor = session(ids.agent, 'agent', homeTenantId, ids.agentBranch);
      expect(await fixture.get({ session: actor, claimId: ids.claim })).toMatchObject({
        success: true,
      });
      const sent = await fixture.send({
        session: actor,
        requestHeaders: new Headers(),
        claimId: ids.claim,
        content: 'Current null branch remains admitted',
      });
      expect(sent).toMatchObject({ success: true });
      if (sent.success) createdMessageId = sent.message.id;
      expect(await fixture.markRead({ session: actor, messageIds: [receiptId] })).toEqual({
        success: true,
      });
      expect(
        await fixture.database.dbAdmin.query.claimMessages.findFirst({
          where: eq(fixture.database.claimMessages.id, receiptId),
        })
      ).toMatchObject({ readAt: expect.any(Date) });
    } finally {
      if (createdMessageId)
        await fixture.database.dbAdmin
          .delete(fixture.database.claimMessages)
          .where(eq(fixture.database.claimMessages.id, createdMessageId));
      await fixture.database.dbAdmin
        .update(fixture.database.user)
        .set({ branchId: ids.agentBranch })
        .where(eq(fixture.database.user.id, ids.agent));
      await fixture.database.dbAdmin
        .update(fixture.database.claims)
        .set({ branchId: null })
        .where(eq(fixture.database.claims.id, ids.claim));
      await fixture.database.dbAdmin
        .delete(fixture.database.claimMessages)
        .where(eq(fixture.database.claimMessages.id, receiptId));
    }
  });
});
