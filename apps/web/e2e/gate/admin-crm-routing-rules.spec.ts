import { and, db, eq, inArray, isNull, user } from '@interdomestik/database';
import { crmRoutingRules } from '@interdomestik/database/schema';
import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/auth.fixture';
import { credsFor, getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const RULE_FORM_MARKER = 'admin-crm-routing-rule-form';
const RULE_LIST_MARKER = 'admin-crm-routing-rules-list';
const RULE_ROW_MARKER = 'admin-crm-routing-rule-row';
const ACTION_RESULT_MARKER = 'admin-crm-routing-action-result';
const REORDER_BUTTON_MARKER = 'admin-crm-routing-reorder-button';
const ENABLED_BUTTON_MARKER = 'admin-crm-routing-enabled-button';
const ARCHIVE_BUTTON_MARKER = 'admin-crm-routing-archive-button';

function adminCrmRoute(testInfo: Parameters<typeof routes.getLocale>[0]) {
  return `/${routes.getLocale(testInfo)}/admin/crm`;
}

async function resolveAdminRoutingContext(testInfo: Parameters<typeof getTenantFromTestInfo>[0]) {
  const tenant = getTenantFromTestInfo(testInfo);
  const admin = await db.query.user.findFirst({
    columns: { email: true, id: true, tenantId: true },
    where: eq(user.email, credsFor('admin', tenant).email),
  });

  if (!admin?.tenantId) {
    throw new Error(`Expected seeded admin with tenant context for ${tenant}`);
  }

  const agent = await db.query.user.findFirst({
    columns: { branchId: true, id: true, tenantId: true },
    where: and(eq(user.tenantId, admin.tenantId), eq(user.role, 'agent')),
  });

  if (!agent?.id) {
    throw new Error(`Expected seeded agent for tenant ${admin.tenantId}`);
  }

  return { agentId: agent.id, tenantId: admin.tenantId };
}

async function cleanupRules(tenantId: string, sources: readonly string[]): Promise<void> {
  await db
    .delete(crmRoutingRules)
    .where(
      and(eq(crmRoutingRules.tenantId, tenantId), inArray(crmRoutingRules.source, [...sources]))
    );
}

async function snapshotTenantWidePriorities(
  tenantId: string
): Promise<ReadonlyArray<{ id: string; priority: number }>> {
  return db.query.crmRoutingRules.findMany({
    columns: { id: true, priority: true },
    where: and(
      eq(crmRoutingRules.tenantId, tenantId),
      isNull(crmRoutingRules.branchId),
      isNull(crmRoutingRules.archivedAt)
    ),
  });
}

async function restoreTenantWidePriorities(
  tenantId: string,
  snapshot: ReadonlyArray<{ id: string; priority: number }>
): Promise<void> {
  for (const row of snapshot) {
    await db
      .update(crmRoutingRules)
      .set({ priority: row.priority })
      .where(and(eq(crmRoutingRules.tenantId, tenantId), eq(crmRoutingRules.id, row.id)));
  }
}

async function seedRule(args: {
  agentId: string;
  priority: number;
  source: string;
  tenantId: string;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(crmRoutingRules).values({
    id,
    agentPool: [args.agentId],
    branchId: null,
    enabled: true,
    priority: args.priority,
    source: args.source,
    strategy: 'round_robin',
    tenantId: args.tenantId,
  });
  return id;
}

async function rulePriority(tenantId: string, source: string): Promise<number | null> {
  const rule = await db.query.crmRoutingRules.findFirst({
    columns: { priority: true },
    where: and(eq(crmRoutingRules.tenantId, tenantId), eq(crmRoutingRules.source, source)),
  });
  return rule?.priority ?? null;
}

async function ruleEnabled(tenantId: string, source: string): Promise<boolean | null> {
  const rule = await db.query.crmRoutingRules.findFirst({
    columns: { enabled: true },
    where: and(eq(crmRoutingRules.tenantId, tenantId), eq(crmRoutingRules.source, source)),
  });
  return rule?.enabled ?? null;
}

test.describe('Admin CRM routing rules @admin-crm-routing-rules', () => {
  test('admin can create, reorder, disable, and archive a routing rule', async ({
    page,
    loginAs,
  }, testInfo) => {
    const context = await resolveAdminRoutingContext(testInfo);
    const suffix = `${testInfo.project.name}-${testInfo.workerIndex}`.replace(/[^a-z0-9-]/gi, '-');
    const seededSource = `crm09-e2e-seeded-${suffix}`;
    const createdSource = `crm09-e2e-created-${suffix}`;
    await cleanupRules(context.tenantId, [seededSource, createdSource]);
    const prioritySnapshot = await snapshotTenantWidePriorities(context.tenantId);
    await seedRule({
      agentId: context.agentId,
      priority: 1000,
      source: seededSource,
      tenantId: context.tenantId,
    });

    try {
      await loginAs('admin');
      await gotoApp(page, adminCrmRoute(testInfo), testInfo, { marker: 'admin-crm-page-ready' });

      await expect(page.getByTestId(RULE_FORM_MARKER).first()).toBeVisible();
      await expect(page.getByTestId(RULE_LIST_MARKER).first()).toBeVisible();

      const createForm = page.getByTestId(RULE_FORM_MARKER).first();
      await createForm.locator('input[name="agentIds"]').fill(context.agentId);
      await createForm.locator('input[name="priority"]').fill('1001');
      await createForm.locator('input[name="source"]').fill(createdSource);
      await createForm.locator('button[type="submit"]').click();

      const createdRow = page.getByTestId(RULE_ROW_MARKER).filter({ hasText: createdSource });
      await expect(createdRow.first()).toBeVisible();

      const moveUpButton = createdRow.first().getByTestId(REORDER_BUTTON_MARKER).first();
      await expect(moveUpButton).toBeEnabled();
      await moveUpButton.click();
      await expect
        .poll(async () => {
          const created = await rulePriority(context.tenantId, createdSource);
          const seeded = await rulePriority(context.tenantId, seededSource);
          return created !== null && seeded !== null && created < seeded;
        })
        .toBe(true);

      await createdRow.first().getByTestId(ENABLED_BUTTON_MARKER).click();
      await expect(page.getByTestId(ACTION_RESULT_MARKER).first()).toBeVisible();
      await expect.poll(async () => ruleEnabled(context.tenantId, createdSource)).toBe(false);

      await createdRow.first().getByTestId(ARCHIVE_BUTTON_MARKER).click();
      await expect(createdRow.first().getByTestId(ARCHIVE_BUTTON_MARKER)).toBeDisabled();
    } finally {
      await restoreTenantWidePriorities(context.tenantId, prioritySnapshot);
      await cleanupRules(context.tenantId, [seededSource, createdSource]);
    }
  });

  test('branch-manager sees reporting but no routing rule controls', async ({
    page,
    loginAs,
  }, testInfo) => {
    await loginAs('branch_manager');
    await gotoApp(page, adminCrmRoute(testInfo), testInfo, { marker: 'admin-crm-page-ready' });

    await expect(page.getByTestId('branch-manager-crm-reporting-snapshot').first()).toBeVisible();
    await expect(page.getByTestId(RULE_FORM_MARKER)).toHaveCount(0);
    await expect(page.getByTestId(RULE_LIST_MARKER)).toHaveCount(0);
    await expect(page.getByTestId(RULE_ROW_MARKER)).toHaveCount(0);
    await expect(page.getByTestId(ACTION_RESULT_MARKER)).toHaveCount(0);
  });
});
