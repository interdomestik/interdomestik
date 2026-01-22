import { db, leadPaymentAttempts } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, ne } from 'drizzle-orm';
import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { assertAccessDenied } from '../utils/rbac';

const MK_MEMBER_NUMBER = 'MEM-2026-000001';
const KS_TENANT_ID = 'tenant_ks';
const KS_BRANCH_A = 'ks_branch_a';

test.describe('RBAC Scope Guards (Golden)', () => {
  test('Tenant admin cannot resolve memberNumber from another tenant', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes('mk'), 'KS-only check');

    const targetPath = `${routes.admin(testInfo)}/members/number/${MK_MEMBER_NUMBER}`;

    // We expect access denied, so we use a generic marker or body
    await gotoApp(page, targetPath, testInfo, { marker: 'body' });
    await assertAccessDenied(page);
  });

  test('Branch manager cannot fetch verification details from another branch', async ({
    branchManagerPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes('mk'), 'KS-only check');

    const [attempt] = await db
      .select({
        id: leadPaymentAttempts.id,
        branchId: memberLeads.branchId,
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
      .where(
        and(
          eq(leadPaymentAttempts.tenantId, KS_TENANT_ID),
          eq(leadPaymentAttempts.method, 'cash'),
          ne(memberLeads.branchId, KS_BRANCH_A)
        )
      )
      .limit(1);

    if (!attempt) {
      test.skip(true, 'No eligible cross-branch attempt found in DB');
      return;
    }

    // Direct API check (Deterministic RBAC enforcement)
    const apiBase = new URL(testInfo.project.use.baseURL!).origin;
    const response = await page.request.get(`${apiBase}/api/verification/${attempt.id}`);
    expect(response.status()).toBe(404);
  });
});
