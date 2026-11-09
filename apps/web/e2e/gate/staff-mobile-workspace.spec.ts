import { E2E_CASE_FIXTURES } from '@interdomestik/database';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.use({ viewport: { width: 390, height: 844 } });

const WORKSPACE_SECTIONS = [
  'staff-claim-handling',
  'staff-claim-requests',
  'staff-claim-documents',
  'staff-claim-messages',
  'staff-claim-context',
  'staff-status-history',
] as const;

async function initializeConsent(page: Page): Promise<void> {
  // Reuse the pre-navigation consent setup from public-header-overflow.spec.ts.
  await page.addInitScript(() => {
    localStorage.setItem('interdomestik_cookie_consent_v1', 'necessary');
    document.cookie = 'cookie_consent=necessary; Path=/; SameSite=Lax';
  });
}

async function expectReflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        document: document.documentElement.scrollWidth <= window.innerWidth,
        body: document.body.scrollWidth <= window.innerWidth,
      }))
    )
    .toEqual({ document: true, body: true });
}

async function expectMoreFocusReturn(page: Page, staff: boolean): Promise<void> {
  const nav = page.getByTestId('role-shell-bottom-nav');
  const more = nav.getByRole('button');
  await more.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('a[href$="/staff/settings"]')).toHaveCount(1);
  await expect(sheet.locator('a[href$="/staff/crm"]')).toHaveCount(staff ? 1 : 0);
  await expect(sheet.locator('a[href$="/staff/sponsors"]')).toHaveCount(staff ? 1 : 0);
  await expect(sheet.getByTestId('sidebar-user-menu-button')).toBeVisible();
  await expectReflow(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(more).toBeFocused();
}

test('staff queues stay inside the shared mobile shell', async ({ staffPage: page }, info) => {
  test.setTimeout(180_000);
  await initializeConsent(page);
  await gotoApp(page, routes.staffClaims(info), info, { marker: 'staff-page-ready' });
  for (const width of [360, 390, 430, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const nav = page.getByTestId('role-shell-bottom-nav');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.locator('a[href$="/staff/claims"]')).toHaveAttribute('aria-current', 'page');
    for (const target of await nav.locator('a, button').all()) {
      const box = await target.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expectMoreFocusReturn(page, true);
    await nav.locator('a[href$="/staff/support-handoffs"]').click();
    await expect(page.getByTestId('staff-support-handoffs-queue')).toBeVisible();
    await expectReflow(page);
    await nav.locator('a[href$="/staff/claims"]').click();
    await expect(page.getByTestId('staff-claims-queue')).toBeVisible();
    await expectReflow(page);
  }
});

test('assigned staff case stays inside the shared mobile shell', async ({
  staffPage: page,
}, info) => {
  test.setTimeout(120_000);
  test.skip(
    getTenantFromTestInfo(info) !== 'ks',
    'Assigned seeded document fixture is maintained in KS; MK seeded cases are unassigned'
  );
  // Existing assigned fixture only; this gate creates no claims, users or messages.
  const claimId = E2E_CASE_FIXTURES.KS_ANCHOR.id;
  await initializeConsent(page);
  await gotoApp(page, routes.staffClaimDetail(claimId, info), info, {
    marker: 'staff-claim-detail-ready',
  });
  const workspace = page.getByTestId('staff-claim-detail-ready');
  await expect(workspace.getByTestId('messaging-panel')).toBeVisible();
  for (const width of [360, 390, 430, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
    const sectionNav = workspace.getByTestId('staff-claim-workspace-nav');
    await expect(sectionNav.getByRole('link')).toHaveCount(WORKSPACE_SECTIONS.length);
    for (const section of WORKSPACE_SECTIONS) {
      const link = sectionNav.locator(`a[href="#${section}"]`);
      await expect(link).toHaveCount(1);
      await link.click();
      const target = workspace.locator(`[id="${section}"]`);
      await expect(target).toBeVisible();
      await expect
        .poll(() =>
          target.evaluate(element => {
            const header = document.querySelector('[data-testid="role-shell"] > div > header');
            return (
              element.getBoundingClientRect().top - (header?.getBoundingClientRect().bottom ?? 0)
            );
          })
        )
        .toBeGreaterThanOrEqual(0);
    }
  }

  // A reduced viewport models keyboard space; hardware keyboard behavior needs device proof.
  await page.setViewportSize({ width: 390, height: 400 });
  const note = workspace.locator('#claim-status-note');
  const save = workspace.getByTestId('staff-update-claim-button');
  // Enable Save with an unsaved synthetic note; never submit it.
  await note.fill('M1.3 synthetic mobile visibility check (unsaved)');
  await expect(save).toBeEnabled();
  await note.focus();
  await expect(note).toBeFocused();
  await expect(page.getByTestId('role-shell-bottom-nav')).toBeHidden();
  await expect
    .poll(() =>
      page
        .locator('[data-testid="role-shell"] > div > header')
        .evaluate(element => getComputedStyle(element).position)
    )
    .toBe('static');
  for (const control of [note, save]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    await expect
      .poll(() =>
        control.evaluate(element => {
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit === element || (hit !== null && element.contains(hit));
        })
      )
      .toBe(true);
  }
  await note.focus();
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await expectReflow(page);
});

test('branch-manager mobile detail retains read-only controls and permitted navigation', async ({
  branchManagerPage: page,
}, info) => {
  test.setTimeout(120_000);
  await initializeConsent(page);
  await gotoApp(page, routes.staffClaims(info), info, { marker: 'staff-page-ready' });
  await expectMoreFocusReturn(page, false);
  const permittedCases = page.getByTestId('staff-claims-view').filter({ visible: true });
  expect(await permittedCases.count()).toBeGreaterThan(0);
  await permittedCases.first().click();
  await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();

  for (const width of [360, 390, 430, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByTestId('staff-claim-readonly-notice')).toBeVisible();
    for (const marker of [
      'staff-claim-detail-actions',
      'staff-claim-detail-messaging',
      'messaging-panel',
      'message-input',
      'send-message-button',
      'staff-information-request-form',
      'staff-assign-claim-button',
    ]) {
      await expect(page.getByTestId(marker)).toHaveCount(0);
    }
    const sectionNav = page.getByTestId('staff-claim-workspace-nav');
    await expect(sectionNav.locator('a[href="#staff-claim-handling"]')).toHaveCount(0);
    await expect(sectionNav.locator('a[href="#staff-claim-messages"]')).toHaveCount(0);
    await expect(page.getByTestId('staff-claim-detail-ready').locator('form')).toHaveCount(0);
    await expectMoreFocusReturn(page, false);
    await expectReflow(page);
  }
});
