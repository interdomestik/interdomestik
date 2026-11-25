import { db, eq, leadPaymentAttempts, memberLeads } from '@interdomestik/database';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';
import {
  insertOwnedMemberLead,
  removeOwnedMemberLead,
  type OwnedLead,
} from '../utils/owned-member-lead';
import {
  expectActivatedMember,
  openActivationHistory,
  removeActivationCredentials,
  setPasswordFromActivationInvite,
} from './acq2b2-activation-invite.fixture';
import { deleteMail, mailboxConfigured } from './s5-otp-mailbox.fixture';

// The set-password link is a credential until it is used, so this spec records no trace, video or
// screenshot.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

async function convertedMemberId(leadId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: memberLeads.convertedUserId })
    .from(memberLeads)
    .where(eq(memberLeads.id, leadId));
  return row?.id ?? null;
}

/**
 * ACQ-2b2 (owner decision B): approving a cash payment converts the lead and emails the member a
 * password-set link through the existing reset flow on this deployment. The member sets a
 * password from it and signs in as the converted account; nobody else chose that credential.
 */
test.describe('ACQ-2b2 member activation invite', () => {
  test('an approved cash member sets a password from the invite and signs in', async ({
    adminPage,
    browser,
  }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run converts a member.');
    if (process.env.E2E_OTP_PROOF_REQUIRED === '1') {
      expect(mailboxConfigured(), 'the lane provides the mail catcher').toBe(true);
    }
    testInfo.skip(!mailboxConfigured(), 'Needs E2E_SMTP_HOST (loopback mail catcher).');
    test.setTimeout(180_000);
    const seen = new Set<string>();
    let lead: OwnedLead | undefined;
    let memberId: string | null = null;
    try {
      lead = await insertOwnedMemberLead('ks', 'acq2b2', 'Activation');
      const owned = lead;
      const [{ tenantId }] = await db
        .select({ tenantId: memberLeads.tenantId })
        .from(memberLeads)
        .where(eq(memberLeads.id, owned.id));
      // Fixture setup: the approval and what follows it are under test, not lead entry or cash.
      await db.insert(leadPaymentAttempts).values({
        id: `${owned.id}_attempt`,
        tenantId,
        leadId: owned.id,
        method: 'cash',
        status: 'pending',
        amount: 15000,
      });
      await db
        .update(memberLeads)
        .set({ status: 'payment_pending' })
        .where(eq(memberLeads.id, owned.id));

      const query = new URLSearchParams({ query: owned.email });
      await gotoApp(adminPage, `/admin/leads?${query}`, testInfo, {
        marker: 'verification-ops-page',
      });
      await adminPage
        .getByTestId('cash-verification-row')
        .filter({ visible: true })
        .filter({ has: adminPage.getByText(owned.email, { exact: true }) })
        .getByTestId('cash-approve')
        .click();
      await expect.poll(() => convertedMemberId(owned.id)).not.toBeNull();
      memberId = await convertedMemberId(owned.id);
      // Until the member sets a password, the history row offers to resend the invite.
      const historyRow = await openActivationHistory(adminPage, testInfo, owned.email);
      await expect(historyRow.getByTestId('resend-activation-invite')).toBeVisible();

      await setPasswordFromActivationInvite({ browser, email: owned.email, seen, testInfo });
      await expectActivatedMember(memberId!, owned.email, tenantId);

      // The password set from the invite verifies the mailbox (ACQ-2c): no resend is offered any more.
      await expect(await openActivationHistory(adminPage, testInfo, owned.email)).toBeVisible();
      await expect(historyRow.getByTestId('resend-activation-invite')).toHaveCount(0);
    } finally {
      if (memberId) await removeActivationCredentials(memberId);
      await removeOwnedMemberLead(lead);
      await deleteMail(seen);
    }
  });
});
