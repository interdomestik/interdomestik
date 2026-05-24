import { db, E2E_USERS, eq, inArray, sql, user } from '@interdomestik/database';
import {
  crmActivities,
  crmDeals,
  crmLeads,
  crmTaskHistory,
  crmTasks,
} from '@interdomestik/database/schema';
import type { Locator, Page, TestInfo } from '@playwright/test';
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

async function openTaskQueueSecondaryActions(row: Locator): Promise<void> {
  const panel = row.getByTestId('agent-crm-task-queue-secondary-panel');
  if (
    (await panel.count()) > 0 &&
    (await panel
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    return;
  }

  const toggle = row.getByTestId('agent-crm-task-queue-secondary-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(panel).toBeVisible();
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

async function readOpenTaskDueAt(leadId: string): Promise<Date | null | undefined> {
  const openFollowUp = await db.query.crmTasks.findFirst({
    where: (table, { and, eq, inArray }) =>
      and(
        eq(table.subjectKind, 'lead'),
        eq(table.subjectId, leadId),
        eq(table.createReasonCode, 'follow_up'),
        inArray(table.status, ['pending', 'in_progress'])
      ),
    columns: { dueAt: true },
  });

  return openFollowUp?.dueAt;
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

async function insertQueueTaskFollowUp(args: {
  agentId: string;
  branchId: string;
  dueAt: Date;
  leadId: string;
  taskId: string;
  tenantId: string;
}): Promise<void> {
  await db.insert(crmTasks).values({
    id: args.taskId,
    tenantId: args.tenantId,
    branchId: args.branchId,
    subjectKind: 'lead',
    subjectId: args.leadId,
    assignedKind: 'actor',
    assignedActorId: args.agentId,
    assignedRole: 'agent',
    assignedBranchId: args.branchId,
    assignedTenantId: args.tenantId,
    status: 'pending',
    priority: 'normal',
    dueAt: args.dueAt,
    idempotencyKey: null,
    lifecycleVersion: 1,
    createdById: args.agentId,
    createdByRole: 'agent',
    createdByBranchId: args.branchId,
    createReasonCode: 'follow_up',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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
    const cancelLeadId = `${CRM13_PREFIX}cancel-${suffix}`;
    const futureLeadId = `${CRM13_PREFIX}future-${suffix}`;
    const offTenantLeadId = `${CRM13_PREFIX}offtenant-${suffix}`;
    const cancelTaskId = `${CRM13_PREFIX}cancel-task-${suffix}`;
    const dealId = `${CRM13_PREFIX}deal-${suffix}`;
    const futureActivityId = `${CRM13_PREFIX}future-activity-${suffix}`;
    const offTenantActivityId = `${CRM13_PREFIX}offtenant-activity-${suffix}`;
    const seededIds = {
      activityIds: [futureActivityId, offTenantActivityId],
      dealIds: [dealId],
      leadIds: [leadId, cancelLeadId, futureLeadId, offTenantLeadId],
    };
    const leadName = `CRM13 Follow Up ${suffix}`;
    const agent = await requireAgent(agentEmail);
    const otherAgent = await requireAgent(otherAgentEmail);

    try {
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
        leadId: cancelLeadId,
        name: `CRM13 Cancel ${suffix}`,
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
      await insertQueueTaskFollowUp({
        agentId: agent.id,
        branchId: agent.branchId,
        dueAt: new Date(Date.now() - 30_000),
        leadId: cancelLeadId,
        taskId: cancelTaskId,
        tenantId: agent.tenantId,
      });
      await seedCookieConsent(page, testInfo);

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
      await expect(dueRow.getByTestId('agent-crm-task-queue-start')).toHaveCount(0);
      await expect(dueRow.getByTestId('agent-crm-task-queue-complete')).toHaveCount(0);
      await expect(dueRow.getByTestId('agent-crm-task-queue-due-edit')).toHaveCount(0);
      await expect(dueRow.getByTestId('agent-crm-task-queue-priority')).toHaveCount(0);
      await expect(dueRow.getByTestId('agent-crm-task-queue-cancel')).toHaveCount(0);
      await expect(dueRow.getByTestId('agent-crm-task-queue-secondary-toggle')).toHaveCount(0);
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

      let taskQueue = page.getByTestId('agent-crm-task-queue-ready').first();
      await expect(taskQueue).toBeVisible();
      let taskQueueRow = taskQueue.locator(
        `[data-testid="agent-crm-task-queue-row"][data-lead-id="${leadId}"]`
      );
      const cancelTaskQueueRow = taskQueue.locator(
        `[data-testid="agent-crm-task-queue-row"][data-lead-id="${cancelLeadId}"]`
      );
      await expect(taskQueueRow).toBeVisible({ timeout: 15000 });
      await expect(cancelTaskQueueRow).toBeVisible({ timeout: 15000 });
      await expect(
        taskQueue.locator(
          `[data-testid="agent-crm-task-queue-row"][data-lead-id="${futureLeadId}"]`
        )
      ).toHaveCount(0);
      await expect(
        taskQueue.locator(
          `[data-testid="agent-crm-task-queue-row"][data-lead-id="${offTenantLeadId}"]`
        )
      ).toHaveCount(0);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-open')).toHaveCount(1);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-start')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-complete')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-secondary-toggle')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-edit')).toHaveCount(0);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-priority-select')).toHaveCount(0);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-cancel')).toHaveCount(0);
      await openTaskQueueSecondaryActions(taskQueueRow);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-edit')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-priority-select')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-cancel')).toBeVisible();
      await openTaskQueueSecondaryActions(cancelTaskQueueRow);
      await expect(cancelTaskQueueRow.getByTestId('agent-crm-task-queue-cancel')).toBeVisible();
      await cancelTaskQueueRow.getByTestId('agent-crm-task-queue-cancel').click();
      await expect(
        cancelTaskQueueRow.getByTestId('agent-crm-task-queue-cancel-reason')
      ).toBeVisible();
      await expect(
        cancelTaskQueueRow.getByTestId('agent-crm-task-queue-cancel-confirm')
      ).toBeDisabled();
      await expect(
        cancelTaskQueueRow.locator(
          '[data-testid="agent-crm-task-queue-cancel-reason"] option[value="subject_closed"]'
        )
      ).toHaveCount(0);
      await cancelTaskQueueRow
        .getByTestId('agent-crm-task-queue-cancel-reason')
        .selectOption('duplicate');
      await cancelTaskQueueRow.getByTestId('agent-crm-task-queue-cancel-confirm').click();
      await expect.poll(() => countOpenTaskFollowUps(cancelLeadId), { timeout: 15000 }).toBe(0);
      await gotoApp(page, routes.agentCrm(testInfo), testInfo, {
        marker: 'agent-crm-page-ready',
      });
      taskQueue = page.getByTestId('agent-crm-task-queue-ready').first();
      taskQueueRow = taskQueue.locator(
        `[data-testid="agent-crm-task-queue-row"][data-lead-id="${leadId}"]`
      );
      await expect(
        taskQueue.locator(
          `[data-testid="agent-crm-task-queue-row"][data-lead-id="${cancelLeadId}"]`
        )
      ).toHaveCount(0, { timeout: 15000 });
      await openTaskQueueSecondaryActions(taskQueueRow);
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-edit').click();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-input')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-save')).toBeVisible();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-clear')).toBeVisible();
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-clear').click();
      await expect.poll(() => readOpenTaskDueAt(leadId), { timeout: 15000 }).toBeNull();
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-secondary-panel')).toHaveCount(
        0,
        { timeout: 15000 }
      );
      await openTaskQueueSecondaryActions(taskQueueRow);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-due-edit')).toBeVisible({
        timeout: 15000,
      });
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-edit').click();
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-input').fill('2026-05-23T09:45:30');
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-save').click();
      await expect
        .poll(async () => Boolean(await readOpenTaskDueAt(leadId)), {
          timeout: 15000,
        })
        .toBe(true);
      await expect(taskQueueRow.getByTestId('agent-crm-task-queue-secondary-panel')).toHaveCount(
        0,
        { timeout: 15000 }
      );
      await openTaskQueueSecondaryActions(taskQueueRow);
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-edit').click();
      await taskQueueRow.getByTestId('agent-crm-task-queue-due-cancel').click();
      await expect(taskQueueRow.getByTestId('agent-lead-complete-follow-up')).toHaveCount(0);
      await expect.poll(() => countOpenTaskFollowUps(leadId), { timeout: 15000 }).toBe(1);

      await taskQueueRow.getByTestId('agent-crm-task-queue-open').click();

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
