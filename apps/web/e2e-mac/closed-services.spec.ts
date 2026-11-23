import {
  E2E_USERS,
  and,
  db,
  eq,
  leadPaymentAttempts,
  memberLeads,
  npsSurveyResponses,
  npsSurveyTokens,
  user,
} from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { convertLeadToMember } from '@interdomestik/domain-leads/convert';
import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  expectActivatedMember,
  openActivationHistory,
  removeActivationCredentials,
  setPasswordFromActivationInvite,
} from '../e2e/gate/acq2b2-activation-invite.fixture';
import { deleteMail, mailboxConfigured } from '../e2e/gate/s5-otp-mailbox.fixture';
import { insertOwnedMemberLead, removeOwnedMemberLead } from '../e2e/utils/owned-member-lead';
import { test } from './closed-services.fixture';

// Invite and survey tokens are bearer credentials.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const tenantId = E2E_USERS.KS_MEMBER.tenantId;

test('a member can submit an NPS response', { tag: '@closed-services' }, async ({ request }) => {
  const member = await db.query.user.findFirst({
    where: and(eq(user.tenantId, tenantId), eq(user.email, E2E_USERS.KS_MEMBER.email)),
    columns: { id: true },
  });
  if (!member) throw new Error('Seeded KS member is missing');

  const id = randomUUID();
  const token = randomUUID();
  await db
    .insert(npsSurveyTokens)
    .values({ id, token, tenantId, userId: member.id, dedupeKey: id });
  try {
    const url = '/api/public/nps';
    const submitted = await request.post(url, { data: { token, score: 9 } });
    expect(submitted.status()).toBe(200);
    expect(await submitted.json()).toEqual({ success: true });

    const replay = await request.post(url, { data: { token, score: 1 } });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ success: true, alreadySubmitted: true });
    const responses = await db.query.npsSurveyResponses.findMany({
      where: and(eq(npsSurveyResponses.tenantId, tenantId), eq(npsSurveyResponses.tokenId, id)),
      columns: { score: true, userId: true },
    });
    expect(responses).toEqual([{ score: 9, userId: member.id }]);
  } finally {
    await db
      .delete(npsSurveyTokens)
      .where(and(eq(npsSurveyTokens.tenantId, tenantId), eq(npsSurveyTokens.id, id)));
  }
});

test(
  'an already-paid member receives an invite, sets a password and signs in',
  { tag: '@closed-services' },
  async ({ adminPage, browser }, testInfo) => {
    expect(mailboxConfigured(), 'the Mac lane provides the loopback mail catcher').toBe(true);
    test.setTimeout(180_000);
    const verifier = await db.query.user.findFirst({
      where: and(eq(user.tenantId, tenantId), eq(user.email, E2E_USERS.KS_ADMIN.email)),
      columns: { id: true },
    });
    if (!verifier) throw new Error('Seeded KS cash verifier is missing');

    const lead = await insertOwnedMemberLead('ks', 'closed-services', 'Activation');
    const attemptId = `${lead.id}_attempt`;
    const seen = new Set<string>();
    let memberId: string | undefined;
    try {
      // The admission happened before the stop. The run exercises its fulfillment under closure.
      await db.transaction(async tx => {
        await tx.insert(leadPaymentAttempts).values({
          id: attemptId,
          tenantId,
          leadId: lead.id,
          method: 'cash',
          status: 'succeeded',
          amount: 15000,
          verifiedBy: verifier.id,
          verifiedAt: new Date(),
        });
        await tx
          .update(memberLeads)
          .set({ status: 'paid' })
          .where(and(eq(memberLeads.tenantId, tenantId), eq(memberLeads.id, lead.id)));
      });
      const converted = await convertLeadToMember(mintTestTenantAuthority(tenantId), {
        leadId: lead.id,
        admission: { kind: 'verified_cash', attemptId },
      });
      if (!converted) throw new Error('Previously admitted cash sale did not fulfill');
      memberId = converted.userId;

      const history = await openActivationHistory(adminPage, testInfo, lead.email);
      await history.getByTestId('resend-activation-invite').click();
      await setPasswordFromActivationInvite({ browser, email: lead.email, seen, testInfo });
      await expectActivatedMember(memberId, lead.email, tenantId);

      await expect(await openActivationHistory(adminPage, testInfo, lead.email)).toBeVisible();
      await expect(history.getByTestId('resend-activation-invite')).toHaveCount(0);
    } finally {
      if (memberId) await removeActivationCredentials(memberId);
      await removeOwnedMemberLead(lead);
      await deleteMail(seen);
    }
  }
);
