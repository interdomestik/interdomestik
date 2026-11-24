import {
  claimDocuments,
  claims,
  dbAdmin,
  E2E_USER_IDS,
  eq,
  inArray,
  user,
} from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, loginAtDoor, test } from '../fixtures/one-door.fixture';
import { gotoApp } from '../utils/navigation';
import { attachAdminClaimReadPlans } from './test/admin-claim-detail-plans';

test('admin detail pages under RLS and rechecks the actor, branch and access tenant', async ({
  door: { page, origin, locale },
}, info) => {
  test.skip(info.project.name !== 'gate-ks-sq', 'Runs both tenants at the door from the KS gate');
  test.setTimeout(120_000);
  const prefix = `wp19-${randomUUID()}`;
  const home = 'tenant_ks';
  const access = 'tenant_mk';
  const localId = `${prefix}-local`;
  const transferredId = `${prefix}-transferred`;
  const wrongBranchId = `${prefix}-wrong-branch`;
  const ids = [localId, transferredId, wrongBranchId];
  const now = new Date();
  const staff = Array.from({ length: 28 }, (_, index) => {
    const suffix = String(index).padStart(2, '0');
    return {
      id: `${prefix}-staff-${suffix}`,
      tenantId: index === 27 ? access : home,
      role: index === 26 ? 'agent' : 'staff',
      name: `${prefix} Staff ${suffix}`,
      email: `${prefix}-staff-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    };
  });
  const [manager] = await dbAdmin
    .select({ branchId: user.branchId })
    .from(user)
    .where(eq(user.id, E2E_USER_IDS.KS_BRANCH_MANAGER));
  if (!manager?.branchId) throw new Error('The seeded branch manager needs a branch');

  const docId = (claimId: string, index: number) =>
    `${claimId}-doc-${String(index).padStart(2, '0')}`;
  const path = (claimId: string, query = '') => `/admin/claims/${claimId}${query}`;
  const detail = page.locator('[data-admin-claim-detail]');
  const rows = page.getByTestId('ops-document-row');
  const staffSearch = page.locator('input[name="staffSearch"]');
  const actor = async (key: Parameters<typeof loginAtDoor>[3]) => {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'cookie_consent', value: 'accepted', url: origin }]);
    await loginAtDoor(page, origin, locale, key, info);
  };
  const open = (target: string, marker = 'ops-documents-panel') =>
    gotoApp(page, target, info, { baseURL: `${origin}/${locale}`, marker });
  const denied = async (target: string) => {
    await open(target, 'not-found-page');
    await expect(page.getByTestId('not-found-page')).toBeVisible();
    await expect(detail).toHaveCount(0);
  };

  try {
    await dbAdmin.insert(user).values(staff);
    await dbAdmin.insert(claims).values(
      ids.map(id => ({
        id,
        tenantId: home,
        accessTenantId: id === transferredId ? access : null,
        branchId: id === wrongBranchId ? null : manager.branchId,
        title: id,
        userId: E2E_USER_IDS.KS_MEMBER,
        staffId: id === localId ? staff[25].id : null,
        category: 'other',
        companyName: 'Synthetic company',
        caseLifecycleState: 'verification' as const,
      }))
    );
    await dbAdmin.insert(claimDocuments).values(
      [localId, transferredId].flatMap(claimId =>
        Array.from({ length: 28 }, (_, index) => ({
          id: docId(claimId, index),
          claimId,
          tenantId: home,
          accessTenantId:
            index === 27
              ? claimId === transferredId
                ? home
                : access
              : claimId === transferredId
                ? access
                : null,
          uploadedBy: E2E_USER_IDS.KS_MEMBER,
          name: docId(claimId, index),
          fileType: 'application/pdf',
          fileSize: 1,
          filePath: `pii/tenants/${home}/claims/${claimId}/${index}.pdf`,
        }))
      )
    );

    if (process.env.WP19_EXPLAIN === '1') {
      await attachAdminClaimReadPlans(
        info,
        [
          { tenant: home, claimId: localId, afterId: docId(localId, 24) },
          { tenant: access, claimId: transferredId, afterId: docId(transferredId, 24) },
        ],
        prefix,
        staff[24].id
      );
    }

    await actor('KS_ADMIN');
    await open(path(localId));
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText(docId(localId, 0));
    await expect(rows.last()).toContainText(docId(localId, 24));
    await expect(detail.getByText(staff[25].name, { exact: true })).toBeVisible();
    await page.locator('a[href*="documentsAfter="]').click();
    await expect(page).toHaveURL(
      url => url.searchParams.get('documentsAfter') === docId(localId, 24)
    );
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(docId(localId, 25));
    await expect(rows.last()).toContainText(docId(localId, 26));
    await expect(page.locator('a[href*="documentsAfter="]')).toHaveCount(0);

    await staffSearch.fill(prefix);
    await staffSearch.press('Enter');
    await expect(page).toHaveURL(url => url.searchParams.get('staffSearch') === prefix);
    await expect(page.locator('a[href*="staffAfter="]')).toHaveCount(1);
    await page.locator('a[href*="staffAfter="]').click();
    await expect(page).toHaveURL(url => url.searchParams.get('staffAfter') === staff[24].id);
    await expect(detail.getByText(staff[25].name, { exact: true })).toBeVisible();
    await expect(page.locator('a[href*="staffAfter="]')).toHaveCount(0);

    // Foreign content stays outside the former/home admin's scope even on continuation.
    await denied(
      path(transferredId, `?documentsAfter=${docId(transferredId, 24)}&tenantId=${access}`)
    );

    await actor('MK_ADMIN');
    await open(path(transferredId, `?documentsAfter=${docId(transferredId, 24)}`));
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(docId(transferredId, 25));
    await denied(path(localId, `?documentsAfter=${docId(localId, 24)}&tenantId=${home}`));

    await actor('KS_BRANCH_MANAGER');
    await open(path(localId, `?documentsAfter=${docId(localId, 24)}&staffSearch=${prefix}`));
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('ops-documents-empty')).toContainText('27');
    await expect(rows).toHaveCount(0);
    await expect(staffSearch).toHaveCount(0);
    await denied(path(wrongBranchId, `?branchId=${manager.branchId}`));

    await actor('KS_STAFF');
    await open(path(localId, `?documentsAfter=${docId(localId, 24)}`), 'domcontentloaded');
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(url => !url.pathname.includes('/admin/'));

    await actor('KS_MEMBER_A2');
    await open(
      path(localId, `?userId=${E2E_USER_IDS.KS_ADMIN}&role=admin&tenantId=${home}`),
      'domcontentloaded'
    );
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(url => !url.pathname.includes('/admin/'));
  } finally {
    await dbAdmin.delete(claimDocuments).where(inArray(claimDocuments.claimId, ids));
    await dbAdmin.delete(claims).where(inArray(claims.id, ids));
    await dbAdmin.delete(user).where(
      inArray(
        user.id,
        staff.map(person => person.id)
      )
    );
  }
});
