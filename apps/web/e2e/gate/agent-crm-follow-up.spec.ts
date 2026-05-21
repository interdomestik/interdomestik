import { db, E2E_USERS, eq, inArray, sql, user } from '@interdomestik/database';
import {
  crmActivities,
  crmDeals,
  crmLeads,
  crmTaskHistory,
  crmTasks,
} from '@interdomestik/database/schema';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const CRM13_PREFIX = 'crm13-follow-up-';
const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';

function tenantFromProject(projectName: string): 'ks' | 'mk' {
  return projectName.includes('mk') ? 'mk' : 'ks';
}

async function cleanupCrm13Rows(args: {
  activityIds: string[];
  dealIds: string[];
  leadIds: string[];
}): Promise<void> {
  if (args.leadIds.length > 0) {
    const taskRows = await db.query.crmTasks.findMany({
      where: (table, { inArray }) => inArray(table.subjectId, args.leadIds),
      columns: { id: true },
    });
    const taskIds = taskRows.map(row => row.id);
    if (taskIds.length > 0) {
      await db.delete(crmTaskHistory).where(inArray(crmTaskHistory.taskId, taskIds));
      await db.delete(crmTasks).where(inArray(crmTasks.id, taskIds));
    }
    await db.delete(crmActivities).where(inArray(crmActivities.leadId, args.leadIds));
    await db.delete(crmDeals).where(inArray(crmDeals.leadId, args.leadIds));
    await db.delete(crmLeads).where(inArray(crmLeads.id, args.leadIds));
  }

  if (args.activityIds.length > 0) {
    await db.delete(crmActivities).where(inArray(crmActivities.id, args.activityIds));
  }

  if (args.dealIds.length > 0) {
    await db.delete(crmDeals).where(inArray(crmDeals.id, args.dealIds));
  }
}

async function requireAgent(email: string) {
  const agent = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  if (!agent?.id || !agent.tenantId || !agent.branchId) {
    throw new Error(`Expected seeded agent with tenant and branch context for ${email}`);
  }

  return { branchId: agent.branchId, id: agent.id, tenantId: agent.tenantId };
}

async function dismissCookieConsentIfVisible(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.count())) return;

  const acceptButton = page.getByTestId('cookie-consent-accept').first();
  if (!(await acceptButton.isVisible().catch(() => false))) return;

  await acceptButton.click();
  await expect(banner).toHaveCount(0);
}

async function seedCookieConsent(page: Page, testInfo: TestInfo): Promise<void> {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) {
    throw new Error(`Expected Playwright baseURL for ${testInfo.project.name}`);
  }

  const hostname = new URL(baseURL.toString()).hostname;

  await page.addInitScript(
    ({ key, value }) => {
      globalThis.localStorage.setItem(key, value);
      document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
    },
    { key: COOKIE_CONSENT_STORAGE_KEY, value: 'accepted' }
  );

  await page.context().addCookies([
    {
      domain: hostname,
      name: COOKIE_CONSENT_COOKIE_NAME,
      path: '/',
      sameSite: 'Lax',
      value: 'accepted',
    },
  ]);

  await page.evaluate(
    ({ key, value }) => {
      globalThis.localStorage.setItem(key, value);
      document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
    },
    { key: COOKIE_CONSENT_STORAGE_KEY, value: 'accepted' }
  );
}

async function countOpenLegacyFollowUps(leadId: string): Promise<number> {
  const openFollowUps = await db.query.crmActivities.findMany({
    where: (table, { and, eq, isNull }) =>
      and(eq(table.leadId, leadId), eq(table.type, 'follow_up'), isNull(table.completedAt)),
    columns: { id: true },
  });

  return openFollowUps.length;
}

async function countOpenTaskFollowUps(leadId: string): Promise<number> {
  const openFollowUps = await db.query.crmTasks.findMany({
    where: (table, { and, eq, inArray }) =>
      and(
        eq(table.subjectKind, 'lead'),
        eq(table.subjectId, leadId),
        eq(table.createReasonCode, 'follow_up'),
        inArray(table.status, ['pending', 'in_progress'])
      ),
    columns: { id: true },
  });

  return openFollowUps.length;
}

async function insertLead(args: {
  agentId: string;
  branchId: string;
  leadId: string;
  name: string;
  tenantId: string;
}): Promise<void> {
  await db.insert(crmLeads).values({
    id: args.leadId,
    tenantId: args.tenantId,
    agentId: args.agentId,
    branchId: args.branchId,
    type: 'business',
    fullName: args.name,
    companyName: `${args.name} Company`,
    phone: '+38344123123',
    email: `${args.leadId}@example.com`,
    source: 'e2e',
    stage: 'new',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function insertDueFollowUp(args: {
  activityId: string;
  agentId: string;
  leadId: string;
  scheduledAt: Date;
  tenantId: string;
}): Promise<void> {
  await db.execute(sql`
    insert into "crm_activities"
      ("id", "tenant_id", "lead_id", "agent_id", "type", "summary", "scheduled_at", "completed_at", "created_at")
    values
      (
        ${args.activityId},
        ${args.tenantId},
        ${args.leadId},
        ${args.agentId},
        'follow_up',
        'CRM13 follow-up gate',
        ${args.scheduledAt.toISOString()},
        null,
        ${new Date().toISOString()}
      )
  `);
}

test.describe('P34 CRM13 agent CRM follow-up gate @crm', () => {
  test('agent schedules a lead follow-up, sees it due, and completes it', async ({
    agentPage: page,
  }, testInfo) => {
    const tenant = tenantFromProject(testInfo.project.name);
    const otherTenant = tenant === 'mk' ? 'ks' : 'mk';
    const agentEmail = tenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const otherAgentEmail =
      otherTenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
    const suffix = `${tenant}-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const leadId = `${CRM13_PREFIX}${suffix}`;
    const futureLeadId = `${CRM13_PREFIX}future-${suffix}`;
    const offTenantLeadId = `${CRM13_PREFIX}offtenant-${suffix}`;
    const dealId = `${CRM13_PREFIX}deal-${suffix}`;
    const futureActivityId = `${CRM13_PREFIX}future-activity-${suffix}`;
    const offTenantActivityId = `${CRM13_PREFIX}offtenant-activity-${suffix}`;
    const seededIds = {
      activityIds: [futureActivityId, offTenantActivityId],
      dealIds: [dealId],
      leadIds: [leadId, futureLeadId, offTenantLeadId],
    };
    const leadName = `CRM13 Follow Up ${suffix}`;
    const agent = await requireAgent(agentEmail);
    const otherAgent = await requireAgent(otherAgentEmail);

    await cleanupCrm13Rows(seededIds);
    await insertLead({
      agentId: agent.id,
      branchId: agent.branchId,
      leadId,
      name: leadName,
      tenantId: agent.tenantId,
    });
    await insertLead({
      agentId: agent.id,
      branchId: agent.branchId,
      leadId: futureLeadId,
      name: `CRM13 Future ${suffix}`,
      tenantId: agent.tenantId,
    });
    await insertLead({
      agentId: otherAgent.id,
      branchId: otherAgent.branchId,
      leadId: offTenantLeadId,
      name: `CRM13 Other Tenant ${suffix}`,
      tenantId: otherAgent.tenantId,
    });

    await db.insert(crmDeals).values({
      id: dealId,
      tenantId: agent.tenantId,
      leadId,
      agentId: agent.id,
      valueCents: 10000,
      stage: 'proposal',
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await insertDueFollowUp({
      activityId: futureActivityId,
      agentId: agent.id,
      leadId: futureLeadId,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      tenantId: agent.tenantId,
    });
    await insertDueFollowUp({
      activityId: offTenantActivityId,
      agentId: otherAgent.id,
      leadId: offTenantLeadId,
      scheduledAt: new Date(Date.now() - 60_000),
      tenantId: otherAgent.tenantId,
    });
    await seedCookieConsent(page, testInfo);

    try {
      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });
      await dismissCookieConsentIfVisible(page);

      const detail = page
        .locator(`[data-testid="agent-lead-detail-ready"][data-lead-id="${leadId}"]`)
        .first();
      await expect(detail).toBeVisible();
      await expect(detail.getByTestId('agent-lead-schedule-follow-up')).toBeVisible();
      await detail.getByTestId('agent-lead-schedule-follow-up').click();
      await expect
        .poll(() => countOpenTaskFollowUps(leadId), {
          timeout: 15000,
          intervals: [250, 500, 1000],
        })
        .toBe(1);
      await expect.poll(() => countOpenLegacyFollowUps(leadId), { timeout: 15000 }).toBe(0);

      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });
      const completeFollowUpButton = detail.getByTestId('agent-lead-complete-follow-up').first();
      await expect(completeFollowUpButton).toBeVisible({
        timeout: 15000,
      });

      await gotoApp(page, routes.agentCrm(testInfo), testInfo, {
        marker: 'agent-crm-page-ready',
      });
      await dismissCookieConsentIfVisible(page);

      const dueSection = page.getByTestId('agent-crm-due-follow-ups').first();
      await expect(dueSection.getByTestId('agent-crm-due-follow-up-count').first()).toContainText(
        /^[1-9]\d*\b/
      );
      const dueRow = dueSection.locator(
        `[data-testid="agent-crm-due-follow-up-row"][data-lead-id="${leadId}"]`
      );
      await expect(dueRow).toBeVisible({ timeout: 15000 });
      await expect(
        dueSection.locator(
          `[data-testid="agent-crm-due-follow-up-row"][data-lead-id="${futureLeadId}"]`
        )
      ).toHaveCount(0);
      await expect(
        dueSection.locator(
          `[data-testid="agent-crm-due-follow-up-row"][data-lead-id="${offTenantLeadId}"]`
        )
      ).toHaveCount(0);
      await dueRow.getByTestId('agent-crm-due-follow-up-open').click();

      await expect(detail).toBeVisible({ timeout: 15000 });
      await detail.getByTestId('agent-lead-complete-follow-up').first().click();
      await expect
        .poll(() => countOpenTaskFollowUps(leadId), {
          timeout: 15000,
          intervals: [250, 500, 1000],
        })
        .toBe(0);

      await gotoApp(page, `/agent/leads/${encodeURIComponent(leadId)}`, testInfo, {
        marker: 'agent-lead-detail-ready',
      });
      await expect(detail.getByTestId('agent-lead-schedule-follow-up').first()).toBeVisible({
        timeout: 15000,
      });

      await gotoApp(page, routes.agentCrm(testInfo), testInfo, {
        marker: 'agent-crm-page-ready',
      });
      const finalDueSection = page.getByTestId('agent-crm-due-follow-ups').first();
      await expect(
        finalDueSection.locator(
          `[data-testid="agent-crm-due-follow-up-row"][data-lead-id="${leadId}"]`
        )
      ).toHaveCount(0);

      await expect.poll(() => countOpenTaskFollowUps(leadId), { timeout: 15000 }).toBe(0);
      await expect.poll(() => countOpenLegacyFollowUps(leadId), { timeout: 15000 }).toBe(0);
    } finally {
      await cleanupCrm13Rows(seededIds);
    }
  });
});
