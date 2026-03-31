import { db, eq, user } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import type { Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const SUPER_ADMIN_EMAIL = 'super@interdomestik.com';
const PASSWORD = 'GoldenPass123!';
const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';
const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
function isKsAdminProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'ks-sq' || testInfo.project.name === 'smoke';
}

function isMkAdminProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mk-mk';
}

async function preparePendingMember(testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const memberId = `e2e-tenant-review-${suffix}`;

  await db.insert(user).values({
    id: memberId,
    tenantId: 'tenant_ks',
    tenantClassificationPending: true,
    name: `E2E Pending ${testInfo.project.name}`,
    email: `e2e.tenant.review.${suffix}@interdomestik.test`,
    emailVerified: true,
    role: 'member',
    createdAt: new Date(),
    updatedAt: new Date(),
    agentId: null,
    branchId: null,
    createdBy: 'self',
    assistedByAgentId: null,
    memberNumber: null,
    memberNumberIssuedAt: null,
  });

  return memberId;
}

async function resetPendingMember(memberId: string) {
  await db.delete(user).where(eq(user.id, memberId));
}

async function loginAsSuperAdmin(page: Page, testInfo: TestInfo): Promise<void> {
  const baseURL = testInfo.project.use.baseURL ?? 'http://mk.127.0.0.1.nip.io:3000/mk';
  const origin = new URL(baseURL.toString()).origin;
  const locale = routes.getLocale(testInfo);

  await page.context().clearCookies();
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: SUPER_ADMIN_EMAIL, password: PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/${locale}/login`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Super admin login failed: ${response.status()} ${await response.text()}`);
  }
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.isVisible().catch(() => false))) {
    return;
  }

  await page.getByTestId('cookie-consent-accept').click();
}

async function seedCookieConsent(page: Page, testInfo: TestInfo): Promise<void> {
  const baseURL = testInfo.project.use.baseURL ?? 'http://mk.127.0.0.1.nip.io:3000/mk';
  const origin = new URL(baseURL.toString()).origin;
  const hostname = new URL(origin).hostname;

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
      document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
      window.dispatchEvent(
        new CustomEvent('interdomestik:cookie-consent-updated', {
          detail: { consent: value },
        })
      );
    },
    { key: COOKIE_CONSENT_STORAGE_KEY, value: 'accepted' }
  );

  await page.context().addCookies([
    {
      name: COOKIE_CONSENT_COOKIE_NAME,
      value: 'accepted',
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
    },
  ]);
}

test.describe.serial('Admin user tenant classification controls', () => {
  test('tenant admin can confirm the current tenant', async ({ adminPage: page }, testInfo) => {
    if (!isKsAdminProject(testInfo)) {
      return;
    }

    const memberId = await preparePendingMember(testInfo);
    const detailPath = `${routes.adminUsers(testInfo)}/${memberId}?tenantId=tenant_ks`;

    try {
      await seedCookieConsent(page, testInfo);
      await gotoApp(page, detailPath, testInfo, { marker: 'body' });

      await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
      await expect(page.getByTestId('tenant-classification-confirm')).toBeVisible();

      await page.getByTestId('tenant-classification-confirm').click();

      await expect(page.getByTestId('tenant-classification-confirmed')).toBeVisible({
        timeout: 15_000,
      });

      await expect
        .poll(async () => {
          const refreshed = await db.query.user.findFirst({
            where: eq(user.id, memberId),
            columns: { tenantClassificationPending: true, tenantId: true },
          });

          return refreshed
            ? {
                tenantClassificationPending: refreshed.tenantClassificationPending,
                tenantId: refreshed.tenantId,
              }
            : null;
        })
        .toEqual({
          tenantClassificationPending: false,
          tenantId: 'tenant_ks',
        });
    } finally {
      await resetPendingMember(memberId);
    }
  });

  test('super admin can reassign the tenant classification', async ({ page }, testInfo) => {
    if (!isMkAdminProject(testInfo)) {
      return;
    }

    const memberId = await preparePendingMember(testInfo);
    await loginAsSuperAdmin(page, testInfo);

    const detailPath = `${routes.adminUsers(testInfo)}/${memberId}?tenantId=tenant_ks`;
    try {
      await seedCookieConsent(page, testInfo);
      await gotoApp(page, detailPath, testInfo, { marker: 'body' });
      await dismissCookieBanner(page);

      await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
      await expect(page.getByTestId('tenant-classification-reassign')).toBeVisible();
      await expect(page.getByTestId('tenant-classification-controls')).toHaveAttribute(
        'data-hydrated',
        'true'
      );

      await page.selectOption('[data-testid="tenant-classification-reassign-select"]', 'tenant_mk');
      await page.getByTestId('tenant-classification-reassign').scrollIntoViewIfNeeded();
      await page.getByTestId('tenant-classification-reassign').click({ force: true });

      await expect(page).toHaveURL(/tenantId=tenant_mk/);
      await expect(page.getByTestId('tenant-classification-confirmed')).toBeVisible({
        timeout: 15_000,
      });

      await expect
        .poll(async () => {
          const refreshed = await db.query.user.findFirst({
            where: eq(user.id, memberId),
            columns: { tenantClassificationPending: true, tenantId: true },
          });

          return refreshed
            ? {
                tenantClassificationPending: refreshed.tenantClassificationPending,
                tenantId: refreshed.tenantId,
              }
            : null;
        })
        .toEqual({
          tenantClassificationPending: false,
          tenantId: 'tenant_mk',
        });
    } finally {
      await resetPendingMember(memberId);
    }
  });
});
