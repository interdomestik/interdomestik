import {
  account,
  db,
  E2E_USERS,
  e2eEmail,
  eq,
  memberLeads,
  subscriptions,
  user,
} from '@interdomestik/database';
import en from '../../src/messages/en/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';
import { removeOwnedMemberLead, type OwnedLead } from '../utils/owned-member-lead';

const PILOT_TENANT_ID = 'pilot-mk';

/**
 * C1 pilot provisioning after ACQ-2 (owner D1 a): an agent never registers a member directly or
 * sets the customer's password. The agent records the lead with consent, takes cash, an approver
 * verifies it, and conversion creates the member with the agent's tenant and branch attribution.
 * The member's own first sign-in (an OTP invite) and its cross-host isolation are proven in ACQ-2b.
 */
test.describe('C1 Pilot: Agent Member Provisioning', () => {
  test.describe.configure({ mode: 'serial' });

  let lead: OwnedLead | undefined;
  test.afterAll(async () => removeOwnedMemberLead(lead));

  test('agent records a consented lead and takes cash; the retired direct path is closed', async ({
    agentPage,
  }, testInfo) => {
    const email = e2eEmail(`member.mk.pilot.${Date.now()}`);
    await gotoApp(agentPage, '/agent/clients/new', testInfo, { marker: 'agent-leads-pro' });
    await expect(agentPage).toHaveURL(/\/agent\/leads$/);

    await agentPage.getByTestId('new-lead-button').click();
    await agentPage.getByTestId('lead-form-firstname').fill('Pilot');
    await agentPage.getByTestId('lead-form-lastname').fill('Member');
    await agentPage.getByTestId('lead-form-email').fill(email);
    await agentPage.getByTestId('lead-form-phone').fill('+38970111222');
    await expect(agentPage.getByTestId('lead-form-submit')).toBeDisabled();
    await agentPage.getByTestId('lead-form-consent').click();
    await agentPage.getByTestId('lead-form-submit').click();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({ id: memberLeads.id })
          .from(memberLeads)
          .where(eq(memberLeads.email, email));
        return row?.id ?? null;
      })
      .not.toBeNull();
    const [row] = await db.select().from(memberLeads).where(eq(memberLeads.email, email));
    lead = { id: row!.id, email };
    expect(row).toMatchObject({
      tenantId: PILOT_TENANT_ID,
      captureChannel: 'agent_assisted',
      consentNoticeVersion: 'lead-notice-v1',
    });

    const leadRow = agentPage.getByTestId(`lead-row-${lead.id}`).filter({ visible: true });
    await leadRow.click();
    const drawer = agentPage.getByRole('dialog');
    await drawer.getByRole('button', { name: en.agent.leads_pro.more_actions }).click();
    await drawer.getByTestId('pay-cash-button').click();
    await expect
      .poll(async () => {
        const [current] = await db
          .select({ status: memberLeads.status })
          .from(memberLeads)
          .where(eq(memberLeads.id, lead!.id));
        return current?.status;
      })
      .toBe('payment_pending');

    const retired = await agentPage.request.post('/api/register', {
      data: { email: e2eEmail(`retired.${Date.now()}`), name: 'Retired', planId: 'standard' },
    });
    expect(retired.status()).toBe(410);
  });

  test('approver verifies the cash and conversion creates an attributed member', async ({
    adminPage,
  }, testInfo) => {
    expect(lead, 'lead from the agent step').toBeTruthy();
    const agent = await db.query.user.findFirst({
      where: eq(user.email, E2E_USERS.PILOT_MK_AGENT.email),
      columns: { id: true, branchId: true },
    });

    await gotoApp(
      adminPage,
      `/admin/leads?${new URLSearchParams({ query: lead!.email })}`,
      testInfo,
      {
        marker: 'verification-ops-page',
      }
    );
    const queued = adminPage
      .getByTestId('cash-verification-row')
      .filter({ visible: true })
      .filter({ has: adminPage.getByText(lead!.email, { exact: true }) });
    await queued.getByTestId('cash-approve').click();

    await expect
      .poll(async () => {
        const [converted] = await db
          .select({ id: memberLeads.convertedUserId })
          .from(memberLeads)
          .where(eq(memberLeads.id, lead!.id));
        return converted?.id ?? null;
      })
      .not.toBeNull();
    const [converted] = await db.select().from(memberLeads).where(eq(memberLeads.id, lead!.id));
    const memberId = converted!.convertedUserId!;

    const member = await db.query.user.findFirst({ where: eq(user.id, memberId) });
    expect(member).toMatchObject({
      role: 'member',
      tenantId: PILOT_TENANT_ID,
      branchId: agent!.branchId,
      agentId: agent!.id,
    });
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, memberId),
    });
    expect(subscription).toMatchObject({
      tenantId: PILOT_TENANT_ID,
      branchId: agent!.branchId,
      agentId: agent!.id,
      status: 'active',
    });
    // Nobody but the customer chooses a credential: conversion attaches none.
    expect(await db.select().from(account).where(eq(account.userId, memberId))).toHaveLength(0);
  });
});
