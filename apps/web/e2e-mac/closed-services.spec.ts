import { E2E_USERS, db, sql } from '@interdomestik/database';
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
  const [member] = await db.execute<{ id: string }>(sql`
    select id from "user" where tenant_id = ${tenantId} and email = ${E2E_USERS.KS_MEMBER.email}
  `);
  if (!member) throw new Error('Seeded KS member is missing');

  const id = randomUUID();
  const token = randomUUID();
  await db.execute(sql`
    insert into nps_survey_tokens (id, token, tenant_id, user_id, dedupe_key)
    values (${id}, ${token}, ${tenantId}, ${member.id}, ${id})
  `);
  try {
    const url = '/api/public/nps';
    const submitted = await request.post(url, { data: { token, score: 9 } });
    expect(submitted.status()).toBe(200);
    expect(await submitted.json()).toEqual({ success: true });

    const replay = await request.post(url, { data: { token, score: 1 } });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ success: true, alreadySubmitted: true });
    const responses = await db.execute(sql`
      select score, user_id as "userId" from nps_survey_responses
      where tenant_id = ${tenantId} and token_id = ${id}
    `);
    expect([...responses]).toEqual([{ score: 9, userId: member.id }]);
  } finally {
    await db.execute(
      sql`delete from nps_survey_tokens where tenant_id = ${tenantId} and id = ${id}`
    );
  }
});

test(
  'an already-paid member receives an invite, sets a password and signs in',
  { tag: '@closed-services' },
  async ({ adminPage, browser }, testInfo) => {
    expect(mailboxConfigured(), 'the Mac lane provides the loopback mail catcher').toBe(true);
    test.setTimeout(180_000);
    const [verifier] = await db.execute<{ id: string }>(sql`
      select id from "user" where tenant_id = ${tenantId} and email = ${E2E_USERS.KS_ADMIN.email}
    `);
    if (!verifier) throw new Error('Seeded KS cash verifier is missing');

    const lead = await insertOwnedMemberLead('ks', 'closed-services', 'Activation');
    const attemptId = `${lead.id}_attempt`;
    const seen = new Set<string>();
    let memberId: string | undefined;
    try {
      // The admission happened before the stop. The run exercises its fulfillment under closure.
      await db.transaction(async tx => {
        const now = new Date().toISOString();
        await tx.execute(sql`
          insert into lead_payment_attempts (id, tenant_id, lead_id, method, status, amount,
            verified_by, verified_at, updated_at)
          values (${attemptId}, ${tenantId}, ${lead.id}, 'cash', 'succeeded', 15000,
            ${verifier.id}, ${now}::timestamp, ${now}::timestamp)
        `);
        await tx.execute(sql`
          update member_leads set status = 'paid', updated_at = ${new Date().toISOString()}::timestamp
          where tenant_id = ${tenantId} and id = ${lead.id}
        `);
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
