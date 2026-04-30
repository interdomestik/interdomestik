import { db, E2E_USERS, eq, user } from '@interdomestik/database';
import { crmDeals, crmLeads } from '@interdomestik/database/schema';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

test.describe('Agent Lead Detail (Golden)', () => {
  test('agent can view a tenant-owned CRM lead detail with inert deal creation', async ({
    agentPage: page,
  }, testInfo) => {
    const tenant = testInfo.project.name.includes('mk') ? 'mk' : 'ks';
    const agentEmail = tenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const suffix = `${tenant}-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const leadId = `crm-detail-${suffix}`;
    const dealId = `crm-detail-deal-${suffix}`;
    const leadEmail = `crm-detail-${suffix}@example.com`;

    const agent = await db.query.user.findFirst({
      where: eq(user.email, agentEmail),
    });

    if (!agent?.id || !agent.tenantId) {
      throw new Error(`Expected seeded agent with tenant context for ${agentEmail}`);
    }

    await db.insert(crmLeads).values({
      id: leadId,
      tenantId: agent.tenantId,
      agentId: agent.id,
      type: 'business',
      fullName: null,
      companyName: 'P26 Detail Test Company',
      phone: '+38344123123',
      email: leadEmail,
      source: 'referral',
      stage: 'negotiation',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(crmDeals).values({
      id: dealId,
      tenantId: agent.tenantId,
      leadId,
      agentId: agent.id,
      valueCents: 25000,
      stage: 'proposal',
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });

      const detail = page.getByTestId('agent-lead-detail-ready').first();
      await expect(detail.getByRole('heading', { name: 'P26 Detail Test Company' })).toBeVisible();
      await expect(detail.getByText(leadEmail)).toBeVisible();
      await expect(detail.getByTestId('agent-lead-create-deal-unavailable').first()).toBeDisabled();
    } finally {
      await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
      await db.delete(crmLeads).where(eq(crmLeads.id, leadId));
    }
  });
});
