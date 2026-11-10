import {
  E2E_CASE_FIXTURES,
  E2E_DISCOVERY_THREADS,
  E2E_DOCUMENT_FIXTURES,
} from '@interdomestik/database';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { initializeConsent } from '../utils/consent';
import { gotoApp } from '../utils/navigation';
import en from '../../src/messages/en/admin-claims.json';
import sq from '../../src/messages/sq/admin-claims.json';
import mk from '../../src/messages/mk/admin-claims.json';
import sr from '../../src/messages/sr/admin-claims.json';
import de from '../../src/messages/de/admin-claims.json';

const catalogs = { en, sq, mk, sr, de };
const widths = [360, 390, 430, 320];
test.use({ viewport: { width: 390, height: 844 } });

function seededCase(info: TestInfo) {
  const key = info.project.name.includes('mk') ? 'MK_FOREIGN_TENANT' : 'KS_ANCHOR';
  return {
    claim: E2E_CASE_FIXTURES[key],
    thread: E2E_DISCOVERY_THREADS[key],
    document: E2E_DOCUMENT_FIXTURES[key],
  };
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

async function expectUncovered(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
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

async function expectEnabledAndUncovered(control: Locator): Promise<void> {
  await expect(control).toBeEnabled();
  await expectUncovered(control);
}

async function expectGeometricallyUncovered(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect
    .poll(() =>
      control.evaluate(element => {
        const box = element.getBoundingClientRect();
        if (
          box.left < 0 ||
          box.top < 0 ||
          box.right > window.innerWidth ||
          box.bottom > window.innerHeight
        ) {
          return false;
        }
        const shellParts = document.querySelectorAll(
          '[data-role-shell-header], [data-role-shell-bottom-navigation]'
        );
        for (const part of shellParts) {
          const shell = part.getBoundingClientRect();
          if (
            box.left < shell.right &&
            box.right > shell.left &&
            box.top < shell.bottom &&
            box.bottom > shell.top
          ) {
            return false;
          }
        }
        return true;
      })
    )
    .toBe(true);
}

async function expectDrawer(page: Page, branchManager: boolean): Promise<void> {
  const header = page.locator('[data-role-shell-header]');
  await expect(header.getByRole('heading')).toBeVisible();
  await expect(header.getByTestId('sidebar-user-menu-button')).toBeVisible();
  await expect(page.getByTestId('role-shell-bottom-nav')).toHaveCount(0);
  const opener = header.locator('button[data-sidebar="trigger"][aria-haspopup]');
  await opener.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('a[href$="/admin/claims"]')).toHaveCount(1);
  await expect(drawer.locator('a[href$="/admin/branches"]')).toHaveCount(branchManager ? 0 : 1);
  await expect(drawer.getByTestId('sidebar-user-menu-button')).toBeVisible();
  for (const target of await drawer.getByRole('navigation').getByRole('link').all()) {
    const box = await target.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await expectReflow(page);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('dialog').getByTestId('sheet-close-button').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
}

test('admin drawer, claims list and same-case detail reflow without covering controls', async ({
  adminPage: page,
  staffPage,
}, info) => {
  test.setTimeout(180_000);
  const { claim, thread, document } = seededCase(info);
  await initializeConsent(page);
  await gotoApp(page, routes.adminClaims(info), info, { marker: 'admin-claims-v2-ready' });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expectDrawer(page, false);
    await expect(page.getByTestId('view-claim').first()).toBeVisible();
    await expectReflow(page);
  }

  await gotoApp(page, `${routes.adminClaims(info)}/${claim.id}`, info, {
    marker: 'admin-page-ready',
  });
  const detail = page.locator('[data-admin-claim-detail]').filter({ visible: true });
  const adminMessages = detail.getByTestId('messaging-panel');
  await expect(adminMessages).toBeVisible();
  // These seeded public and internal texts prove real content, never empty-to-empty equality.
  const expectedMessages = Object.values(thread).flatMap(message =>
    message ? [message.row.content] : []
  );
  for (const content of expectedMessages) {
    await expect(adminMessages.getByText(content, { exact: true })).toBeVisible();
  }
  await initializeConsent(staffPage);
  await gotoApp(staffPage, routes.staffClaimDetail(claim.id, info), info, {
    marker: 'staff-claim-detail-ready',
  });
  const staffMessages = staffPage.getByTestId('messaging-panel').filter({ visible: true });
  for (const content of expectedMessages) {
    await expect(staffMessages.getByText(content, { exact: true })).toBeVisible();
  }
  await expect(
    detail.locator('[data-admin-claim-evidence]').getByText(document.name, { exact: true })
  ).toBeVisible();
  // The KS anchor is assigned; the MK catalogue case is unassigned. Keep the existing
  // assigned-staff evidence admission instead of turning this presentation gate into a grant.
  const staffDocuments = staffPage.getByTestId('staff-claim-documents').filter({ visible: true });
  if (claim.staffId) {
    await expect(staffDocuments.getByText(document.name, { exact: true })).toBeVisible();
  } else {
    await expect(staffDocuments).toHaveCount(0);
  }
  // Compare the entire rendered conversation too, including additional messages already present.
  const messageTexts = (panel: Locator) => panel.locator('p.whitespace-pre-wrap').allTextContents();
  expect(await messageTexts(adminMessages)).toEqual(await messageTexts(staffMessages));

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
    await expectDrawer(page, false);
  }
  // Reduced height models keyboard space; physical keyboard/IME proof belongs to the lead lane.
  await page.setViewportSize({ width: 390, height: 400 });
  const composer = adminMessages.getByTestId('message-input');
  await composer.fill('Mobile workspace draft');
  await expect(composer).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator('[data-role-shell-header]')
        .evaluate(element => getComputedStyle(element).position)
    )
    .toBe('static');
  await expectEnabledAndUncovered(composer);
  await expectUncovered(adminMessages.locator('p.whitespace-pre-wrap').last());
  // Pointer down blurs the composer; the yielded chrome must hold until the gesture ends, or a
  // returning sticky header can take the pointer up. Released off Send, so nothing is sent.
  const header = page.locator('[data-role-shell-header]');
  const send = adminMessages.getByTestId('send-message-button');
  await composer.focus();
  await expectEnabledAndUncovered(send);
  const sendBox = await send.boundingBox();
  expect(sendBox).not.toBeNull();
  await page.mouse.move(sendBox!.x + sendBox!.width / 2, sendBox!.y + sendBox!.height / 2);
  await page.mouse.down();
  expect(await header.evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect.poll(() => header.evaluate(e => getComputedStyle(e).position)).not.toBe('static');
  // Keyboard focus restores the chrome; the focused control must stay unobscured.
  await send.focus();
  await expect(send).toBeFocused();
  await expectEnabledAndUncovered(send);
  const handling = detail.locator('[data-admin-claim-handling]');
  await expect(handling).toBeVisible();
  const handlingControls = await handling.locator('button').all();
  // The admin handling card always renders its controls; an empty list would skip every check.
  expect(handlingControls.length).toBeGreaterThan(0);
  for (const control of handlingControls) {
    if (await control.isDisabled()) {
      await expectGeometricallyUncovered(control);
    } else {
      await expectEnabledAndUncovered(control);
    }
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(24);
    expect(box?.width).toBeGreaterThanOrEqual(24);
  }
  await expectReflow(page);
  await composer.fill('');
});

test('branch-manager claim detail shows only communication summaries and read-only controls', async ({
  branchManagerPage: page,
}, info) => {
  test.setTimeout(120_000);
  const { claim, thread } = seededCase(info);
  const locale = routes.getLocale(info) as keyof typeof catalogs;
  const copy = catalogs[locale].admin.claims_page;
  await initializeConsent(page);
  await gotoApp(page, routes.adminClaims(info), info, { marker: 'admin-claims-v2-ready' });
  await expect(page.getByTestId('view-claim').first()).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expectReflow(page);
  }
  await gotoApp(page, `${routes.adminClaims(info)}/${claim.id}`, info, {
    marker: 'admin-page-ready',
  });
  const detail = page.locator('[data-admin-claim-detail]').filter({ visible: true });
  const summary = detail.getByTestId('claim-message-summary');
  const messageContents = Object.values(thread).flatMap(message =>
    message ? [message.row.content] : []
  );
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(summary).toBeVisible();
    await expect(summary.getByTestId('claim-message-summary-count')).toHaveText(/^\d+$/);
    for (const content of messageContents) await expect(detail).not.toContainText(content);
    for (const marker of ['messaging-panel', 'message-input', 'send-message-button']) {
      await expect(detail.getByTestId(marker)).toHaveCount(0);
    }
    const refresh = summary.getByRole('button');
    await expect(refresh).toHaveAccessibleName(/\S/);
    await refresh.focus();
    await expect(refresh).toBeFocused();
    await expectEnabledAndUncovered(refresh);
    const refreshBox = await refresh.boundingBox();
    expect(refreshBox?.height).toBeGreaterThanOrEqual(24);
    expect(refreshBox?.width).toBeGreaterThanOrEqual(24);
    await expect(detail.getByRole('combobox')).toHaveCount(0);
    await expect(detail.locator('form, input[type="file"]')).toHaveCount(0);
    await expect(detail.locator('[data-admin-claim-evidence]').getByRole('button')).toHaveCount(0);
    // Reviewing blockers only scrolls to the timeline; every mutation button must be absent.
    const handling = detail.locator('[data-admin-claim-handling]');
    for (const button of await handling.getByRole('button').all()) {
      await expect(button).toHaveText(copy.next_actions.actions.review_blockers.label);
    }
    await expectDrawer(page, true);
    await expectReflow(page);
  }
});
