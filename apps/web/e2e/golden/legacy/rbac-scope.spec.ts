import { db, leadPaymentAttempts } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema/leads';
import { and, eq, ne } from 'drizzle-orm';
import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { assertAccessDenied } from '../utils/rbac';

const MK_MEMBER_NUMBER = 'MEM-2026-000001';
const KS_TENANT_ID = 'tenant_ks';
const KS_BRANCH_A = 'ks_branch_a';

test.describe('RBAC Scope Guards (Golden)', () => {
  test('Tenant admin cannot resolve memberNumber from another tenant', async ({
    page,
    loginAs,
  }, testInfo) => {
    if (testInfo.project.name.includes('mk')) {
      test.skip();
    }

    await loginAs('admin');
    await page.goto(`/sq/admin/members/number/${MK_MEMBER_NUMBER}`);
    await assertAccessDenied(page);
  });

  test('Branch manager cannot fetch verification details from another branch', async ({
    page,
    loginAs,
  }, testInfo) => {
    if (testInfo.project.name.includes('mk')) {
      test.skip();
    }

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

    expect(attempt).toBeTruthy();

    await loginAs('branch_manager');
    const response = await page.request.get(`/api/verification/${attempt.id}`);
    expect(response.status()).toBe(404);
  });
});
