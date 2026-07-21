import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const facts = {
  counterparty: 'P00 test operator',
  date: '2026-07-20',
  summary: 'Bounded vehicle preparation facts.',
};

const pilotHeaders = { 'x-tenant-id': 'tenant_ks' };

function visibleIntake(page: Page) {
  return page.locator('[data-testid="claim-draft-intake"]:visible').first();
}

async function fillSupportedDraft(page: Page) {
  const intake = visibleIntake(page);
  const panel = intake.getByTestId('claim-draft-main-panel');
  await intake.getByTestId('claim-draft-category-vehicle').click();
  await intake.getByTestId('claim-draft-category-continue').click();
  await panel.locator('select').nth(0).selectOption('collision');
  await panel.locator('input[type="date"]').fill(facts.date);
  await panel.locator('input[type="text"]').fill(facts.counterparty);
  await panel.locator('select').nth(1).selectOption('repair');
  await panel.locator('textarea').fill(facts.summary);
  await panel.locator('button').last().click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
}

async function freshLogin(page: Page, origin: string, loginPath: string) {
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email: E2E_USERS.KS_MEMBER.email,
      password: E2E_PASSWORD,
      additionalData: { tenantId: 'tenant_ks' },
    },
    headers: { Origin: origin, Referer: `${origin}${loginPath}`, ...pilotHeaders },
  });
  expect(response.ok()).toBe(true);
}

function resolveIdaTarget(testInfo: TestInfo) {
  const locale = routes.getLocale(testInfo);
  const authority = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const baseURL = `http://${authority}/${locale}`;
  return {
    origin: new URL(baseURL).origin,
    testInfo: {
      ...testInfo,
      project: { ...testInfo.project, use: { ...testInfo.project.use, baseURL } },
    } as TestInfo,
  };
}

async function dismissCookieConsent(page: Page) {
  const banner = page.getByTestId('cookie-consent-banner');
  if (!(await banner.isVisible().catch(() => false))) return;
  await page.getByTestId('cookie-consent-accept').click();
  await expect(banner).toHaveCount(0);
}

async function deleteSavedDraft(page: Page, draftId: string) {
  const intake = visibleIntake(page);
  await intake.getByTestId('free-start-manage-open').click();
  const remove = page.getByTestId(`free-start-delete-${draftId}`);
  await expect(remove).toBeVisible();
  await remove.click();
  await page.getByTestId('free-start-delete-confirm').click();
  await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute(
    'data-state',
    'deleted'
  );
  await expect(remove).toHaveCount(0);
}

test.describe('IDA-UI03a3 neutral Claim Draft Intake', () => {
  test('saves and resumes in a fresh context while submit stays dormant', async ({
    browser,
  }, testInfo) => {
    const ida = resolveIdaTarget(testInfo);
    const primaryContext = await browser.newContext({
      extraHTTPHeaders: pilotHeaders,
      storageState: { cookies: [], origins: [] },
    });
    const page = await primaryContext.newPage();
    let draftId: string | undefined;
    let deleted = false;

    try {
      await freshLogin(page, ida.origin, routes.login(ida.testInfo));
      await gotoApp(page, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
        marker: 'new-claim-page-ready',
      });
      const intake = visibleIntake(page);
      await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
      await fillSupportedDraft(page);
      const submit = intake.getByTestId('claim-draft-submit-disabled');
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveAttribute('aria-describedby', 'claim-draft-submit-explanation');
      await intake.getByTestId('free-start-save-open').click();
      await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute(
        'data-state',
        'saved'
      );
      await intake.getByTestId('free-start-manage-open').click();
      const savedResume = page.locator('[data-testid^="free-start-resume-"]').first();
      const exactDraftId = (await savedResume.getAttribute('data-testid'))?.replace(
        'free-start-resume-',
        ''
      );
      if (!exactDraftId) throw new Error('saved_draft_id_missing');
      draftId = exactDraftId;

      const freshContext = await browser.newContext({
        extraHTTPHeaders: pilotHeaders,
        storageState: { cookies: [], origins: [] },
      });
      const resumedPage = await freshContext.newPage();
      try {
        await freshLogin(resumedPage, ida.origin, routes.login(ida.testInfo));
        await gotoApp(resumedPage, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
          marker: 'new-claim-page-ready',
        });
        expect(await resumedPage.evaluate(() => localStorage.length)).toBe(0);
        await dismissCookieConsent(resumedPage);
        const resumedIntake = visibleIntake(resumedPage);
        await resumedIntake.getByTestId('free-start-manage-open').click();
        await resumedPage.getByTestId(`free-start-resume-${exactDraftId}`).click();
        const preview = resumedIntake.getByTestId('claim-draft-dormant-preview');
        await expect(preview).toContainText(facts.counterparty);
        await expect(preview).toContainText(facts.date);
        await expect(preview).toContainText(facts.summary);
        await expect(resumedIntake.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
        await expect(resumedPage.getByTestId('claim-created-success')).toHaveCount(0);
        await deleteSavedDraft(resumedPage, exactDraftId);
        deleted = true;
      } finally {
        await freshContext.close();
      }
    } finally {
      if (!deleted && draftId) await deleteSavedDraft(page, draftId).catch(() => undefined);
      await primaryContext.close();
    }
  });
});
