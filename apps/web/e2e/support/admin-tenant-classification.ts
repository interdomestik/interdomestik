import { db, E2E_PASSWORD, E2E_USERS, eq, user } from '@interdomestik/database';
import type { Page, TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { expect } from '../fixtures/auth.fixture';
import { gotoApp } from '../utils/navigation';
import { routes } from '../routes';

const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';
const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
const LOCAL_TEST_PROTOCOL = 'http:';
const LOCAL_TEST_HOST = 'mk.127.0.0.1.nip.io:3000';

function baseOrigin(testInfo: TestInfo): string {
  const fallbackBaseURL = `${LOCAL_TEST_PROTOCOL}//${LOCAL_TEST_HOST}/mk`;
  const baseURL = testInfo.project.use.baseURL ?? fallbackBaseURL;
  return new URL(baseURL.toString()).origin;
}

export async function preparePendingTenantClassificationMember(params: {
  memberPrefix: string;
  namePrefix: string;
  emailPrefix: string;
  role: 'member' | 'user';
  tenantId: string;
  testInfo: TestInfo;
}) {
  const { memberPrefix, namePrefix, emailPrefix, role, tenantId, testInfo } = params;
  const suffix = `${testInfo.project.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const memberId = `${memberPrefix}-${suffix}`;

  await db.insert(user).values({
    id: memberId,
    tenantId,
    tenantClassificationPending: true,
    name: `${namePrefix} ${testInfo.project.name}`,
    email: `${emailPrefix}.${suffix}@interdomestik.test`,
    emailVerified: true,
    role,
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

export async function resetPendingTenantClassificationMember(memberId: string) {
  await db.delete(user).where(eq(user.id, memberId));
}

export async function loginAsSuperAdmin(page: Page, testInfo: TestInfo): Promise<void> {
  const origin = baseOrigin(testInfo);
  const locale = routes.getLocale(testInfo);

  await page.context().clearCookies();
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: E2E_USERS.SUPER_ADMIN.email, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/${locale}/login`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Super admin login failed: ${response.status()} ${await response.text()}`);
  }
}

export async function seedCookieConsent(page: Page, testInfo: TestInfo): Promise<void> {
  const origin = baseOrigin(testInfo);
  const hostname = new URL(origin).hostname;

  await page.addInitScript(
    ({ key, value }) => {
      globalThis.localStorage.setItem(key, value);
      document.cookie = 'cookie_consent=accepted; Path=/; SameSite=Lax';
      globalThis.dispatchEvent(
        new CustomEvent('interdomestik:cookie-consent-updated', {
          detail: value,
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

async function ensureCookieBannerDismissed(page: Page): Promise<void> {
  const banner = page.getByTestId('cookie-consent-banner');
  const bannerGone = await page
    .waitForFunction(() => !document.querySelector('[data-testid="cookie-consent-banner"]'), {
      timeout: 5_000,
    })
    .then(() => true)
    .catch(() => false);

  if (bannerGone || !(await banner.count())) return;

  const acceptButton = page.getByTestId('cookie-consent-accept').first();
  if (!(await acceptButton.isVisible().catch(() => false))) return;

  await acceptButton.click();
  await expect(banner).toHaveCount(0);
}

async function expectTenantClassificationPersisted(params: {
  page: Page;
  memberId: string;
  expectedTenantId: string;
}) {
  const { page, memberId, expectedTenantId } = params;

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
      tenantId: expectedTenantId,
    });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tenant-classification-confirmed')).toBeVisible({
    timeout: 15_000,
  });
}

export async function confirmCurrentTenantClassification(params: {
  page: Page;
  testInfo: TestInfo;
  memberId: string;
  expectedTenantId: string;
}) {
  const { page, testInfo, memberId, expectedTenantId } = params;
  const detailPath = `${routes.adminUsers(testInfo)}/${memberId}?tenantId=${expectedTenantId}`;

  await seedCookieConsent(page, testInfo);
  await gotoApp(page, detailPath, testInfo, { marker: 'body' });
  await ensureCookieBannerDismissed(page);

  await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
  await expect(page.getByTestId('tenant-classification-confirm')).toBeVisible();
  await page.getByTestId('tenant-classification-confirm').click();
  await expectTenantClassificationPersisted({ page, memberId, expectedTenantId });
}

export async function reassignTenantClassification(params: {
  page: Page;
  testInfo: TestInfo;
  memberId: string;
  currentTenantId: string;
  nextTenantId: string;
  dismissCookieBanner?: boolean;
}) {
  const { page, testInfo, memberId, currentTenantId, nextTenantId, dismissCookieBanner } = params;
  const detailPath = `${routes.adminUsers(testInfo)}/${memberId}?tenantId=${currentTenantId}`;

  await loginAsSuperAdmin(page, testInfo);
  await seedCookieConsent(page, testInfo);
  await gotoApp(page, detailPath, testInfo, { marker: 'body' });
  await ensureCookieBannerDismissed(page);

  if (dismissCookieBanner) {
    await ensureCookieBannerDismissed(page);
  }

  await expect(page.getByTestId('tenant-classification-controls')).toBeVisible();
  await expect(page.getByTestId('tenant-classification-reassign')).toBeVisible();
  await expect
    .poll(
      async () =>
        page
          .getByTestId('tenant-classification-controls')
          .evaluate(node => (node as HTMLElement).dataset.hydrated ?? null),
      { timeout: 15_000 }
    )
    .toBe('true');

  await page.selectOption('[data-testid="tenant-classification-reassign-select"]', nextTenantId);
  await page.getByTestId('tenant-classification-reassign').scrollIntoViewIfNeeded();
  await page.getByTestId('tenant-classification-reassign').click({ force: true });
  await expectTenantClassificationPersisted({ page, memberId, expectedTenantId: nextTenantId });

  await expect
    .poll(() => new URL(page.url()).searchParams.get('tenantId'), {
      timeout: 15_000,
    })
    .toBe(nextTenantId);
}

type SuiteOptions = {
  describeName: string;
  isKsProject: (testInfo: TestInfo) => boolean;
  isMkProject: (testInfo: TestInfo) => boolean;
  memberPrefix: string;
  namePrefix: string;
  emailPrefix: string;
  annotateSkippedProjects?: boolean;
  dismissCookieBannerOnReassign?: boolean;
};

export function registerTenantClassificationSuite(
  test: typeof import('../fixtures/auth.fixture').test,
  options: SuiteOptions
) {
  const {
    describeName,
    isKsProject,
    isMkProject,
    memberPrefix,
    namePrefix,
    emailPrefix,
    annotateSkippedProjects = false,
    dismissCookieBannerOnReassign = false,
  } = options;

  test.describe.serial(describeName, () => {
    test('tenant admin can confirm the current tenant', async ({ adminPage: page }, testInfo) => {
      if (!isKsProject(testInfo)) {
        if (annotateSkippedProjects) {
          testInfo.annotations.push({
            type: 'note',
            description: 'KS-only tenant-classification proof',
          });
        }
        return;
      }

      const memberId = await preparePendingTenantClassificationMember({
        memberPrefix,
        namePrefix,
        emailPrefix,
        role: 'member',
        tenantId: 'tenant_ks',
        testInfo,
      });

      try {
        await confirmCurrentTenantClassification({
          page,
          testInfo,
          memberId,
          expectedTenantId: 'tenant_ks',
        });
      } finally {
        await resetPendingTenantClassificationMember(memberId);
      }
    });

    test('super admin can reassign the tenant classification', async ({ page }, testInfo) => {
      if (!isMkProject(testInfo)) {
        if (annotateSkippedProjects) {
          testInfo.annotations.push({
            type: 'note',
            description: 'MK-only tenant-classification proof',
          });
        }
        return;
      }

      const memberId = await preparePendingTenantClassificationMember({
        memberPrefix,
        namePrefix,
        emailPrefix,
        role: 'member',
        tenantId: 'tenant_ks',
        testInfo,
      });

      try {
        await reassignTenantClassification({
          page,
          testInfo,
          memberId,
          currentTenantId: 'tenant_ks',
          nextTenantId: 'tenant_mk',
          dismissCookieBanner: dismissCookieBannerOnReassign,
        });
      } finally {
        await resetPendingTenantClassificationMember(memberId);
      }
    });
  });
}
