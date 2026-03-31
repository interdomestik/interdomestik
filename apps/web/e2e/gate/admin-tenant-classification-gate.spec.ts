import { db, eq, user } from '@interdomestik/database';
import type { Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const SUPER_ADMIN_EMAIL = 'super@interdomestik.com';
const PASSWORD = 'GoldenPass123!';
const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';
const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
const LOCAL_TEST_PROTOCOL = 'http:';
const LOCAL_TEST_HOST = 'mk.127.0.0.1.nip.io:3000';

function isKsGateProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'gate-ks-sq';
}

function isMkGateProject(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'gate-mk-mk';
}

async function preparePendingMember(testInfo: TestInfo) {
  const suffix = `${testInfo.project.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const memberId = `e2e-gate-tenant-review-${suffix}`;

  await db.insert(user).values({
    id: memberId,
    tenantId: 'tenant_ks',
    tenantClassificationPending: true,
    name: `E2E Gate Pending ${testInfo.project.name}`,
    email: `e2e.gate.tenant.review.${suffix}@interdomestik.test`,
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
  const fallbackBaseURL = `${LOCAL_TEST_PROTOCOL}//${LOCAL_TEST_HOST}/mk`;
  const baseURL = testInfo.project.use.baseURL ?? fallbackBaseURL;
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

async function seedCookieConsent(page: Page, testInfo: TestInfo): Promise<void> {
  const fallbackBaseURL = `${LOCAL_TEST_PROTOCOL}//${LOCAL_TEST_HOST}/mk`;
  const baseURL = testInfo.project.use.baseURL ?? fallbackBaseURL;
  const origin = new URL(baseURL.toString()).origin;
  const hostname = new URL(origin).hostname;

  await page.addInitScript(
    ({ key, value }) => {
      globalThis.localStorage.setItem(key, value);
      document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
      globalThis.dispatchEvent(
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

test.describe.serial('Strict Gate: admin tenant classification', () => {
  test('tenant admin can confirm the current tenant', async ({ adminPage: page }, testInfo) => {
    if (!isKsGateProject(testInfo)) {
      testInfo.annotations.push({
        type: 'note',
        description: 'KS-only gate proof',
      });
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
    if (!isMkGateProject(testInfo)) {
      testInfo.annotations.push({
        type: 'note',
        description: 'MK-only gate proof',
      });
      return;
    }

    const memberId = await preparePendingMember(testInfo);
    const detailPath = `${routes.adminUsers(testInfo)}/${memberId}?tenantId=tenant_ks`;

    try {
      await loginAsSuperAdmin(page, testInfo);
      await seedCookieConsent(page, testInfo);
      await gotoApp(page, detailPath, testInfo, { marker: 'body' });

      await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
      await expect(page.getByTestId('tenant-classification-reassign')).toBeVisible();
      await expect(page.getByTestId('tenant-classification-controls')).toHaveAttribute(
        'data-hydrated',
        'true'
      );

      await page.selectOption('[data-testid="tenant-classification-reassign-select"]', 'tenant_mk');
      await page.getByTestId('tenant-classification-reassign').scrollIntoViewIfNeeded();
      await page.getByTestId('tenant-classification-reassign').click({ force: true });

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

      await expect
        .poll(() => new URL(page.url()).searchParams.get('tenantId'), {
          timeout: 15_000,
        })
        .toBe('tenant_mk');
    } finally {
      await resetPendingMember(memberId);
    }
  });
});
