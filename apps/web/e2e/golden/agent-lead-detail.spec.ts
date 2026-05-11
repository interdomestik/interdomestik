import { db, E2E_USERS, eq, sql, user } from '@interdomestik/database';
import { crmActivities, crmDeals, crmLeads } from '@interdomestik/database/schema';
import { expect, test } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';

async function countOpenFollowUps(leadId: string): Promise<number> {
  const rows = await db.query.crmActivities.findMany({
    where: (table, { and, eq, isNull }) =>
      and(eq(table.leadId, leadId), eq(table.type, 'follow_up'), isNull(table.completedAt)),
    columns: { id: true },
  });

  return rows.length;
}

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

    if (!agent?.id || !agent.tenantId || !agent.branchId) {
      throw new Error(`Expected seeded agent with tenant and branch context for ${agentEmail}`);
    }

    await db.insert(crmLeads).values({
      id: leadId,
      tenantId: agent.tenantId,
      agentId: agent.id,
      branchId: agent.branchId,
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

    await db.execute(sql`
      insert into "crm_activities"
        ("id", "tenant_id", "lead_id", "agent_id", "type", "summary", "scheduled_at", "completed_at", "created_at")
      values
        (
          ${`crm-detail-follow-up-${suffix}`},
          ${agent.tenantId},
          ${leadId},
              ${agent.id},
              'follow_up',
              'CRM12 follow-up call',
              ${new Date(Date.now() - 60_000).toISOString()},
              null,
              ${new Date().toISOString()}
            )
    `);

    try {
      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });

      const detail = page.getByTestId('agent-lead-detail-ready').first();
      await expect(detail.getByRole('heading', { name: 'P26 Detail Test Company' })).toBeVisible();
      await expect(detail.getByText(leadEmail)).toBeVisible();
      await expect(detail.getByTestId('agent-lead-create-deal-unavailable').first()).toBeDisabled();
      await expect(detail.getByTestId('agent-lead-follow-up-card')).toContainText(
        'CRM12 follow-up call'
      );

      await detail.getByTestId('agent-lead-complete-follow-up').click();
      await expect.poll(() => countOpenFollowUps(leadId), { timeout: 15000 }).toBe(0);
      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });
      await expect(detail.getByTestId('agent-lead-schedule-follow-up')).toBeVisible();
    } finally {
      await db.delete(crmActivities).where(eq(crmActivities.leadId, leadId));
      await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
      await db.delete(crmLeads).where(eq(crmLeads.id, leadId));
    }
  });
});
