import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import type { Page, TestInfo } from '@playwright/test';
import sq from '../../src/messages/sq/claims.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// prettier-ignore
const facts = { category: 'vehicle', counterparty: 'P00 test operator', date: '2026-07-20', issue: 'collision', outcome: 'repair', summary: 'Bounded vehicle preparation facts.' };
const pilotHeaders = { 'x-tenant-id': 'tenant_ks' };
// prettier-ignore
const visibleIntake = (page: Page) => page.locator('[data-testid="claim-draft-intake"]:visible').first();
async function fillSupportedDraft(page: Page) {
  const intake = visibleIntake(page);
  const panel = intake.getByTestId('claim-draft-main-panel');
  await intake.getByTestId(`claim-draft-category-${facts.category}`).click();
  await intake.getByTestId('claim-draft-category-continue').click();
  await panel.locator('select').nth(0).selectOption(facts.issue);
  await panel.locator('input[type="date"]').fill(facts.date);
  await panel.locator('input[type="text"]').fill(facts.counterparty);
  await panel.locator('select').nth(1).selectOption(facts.outcome);
  await panel.locator('textarea').fill(facts.summary);
  await panel.locator('button').last().click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
}
async function expectPreservedFacts(intake: ReturnType<typeof visibleIntake>) {
  const reviewedFacts = intake.getByTestId('claim-draft-dormant-preview').locator('dd');
  await expect(reviewedFacts).toHaveCount(6);
  for (const index of [0, 1, 4]) await expect(reviewedFacts.nth(index)).not.toBeEmpty();
  await expect(reviewedFacts.nth(2)).toHaveText(facts.date);
  await expect(reviewedFacts.nth(3)).toHaveText(facts.counterparty);
  await expect(reviewedFacts.nth(5)).toHaveText(facts.summary);
}

async function freshLogin(page: Page, origin: string, loginPath: string) {
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    // prettier-ignore
    data: { email: E2E_USERS.KS_MEMBER.email, password: E2E_PASSWORD, additionalData: { tenantId: 'tenant_ks' } },
    headers: { Origin: origin, Referer: `${origin}${loginPath}`, ...pilotHeaders },
  });
  expect(response.ok()).toBe(true);
}

function resolveIdaTarget(testInfo: TestInfo) {
  const locale = routes.getLocale(testInfo);
  const configured = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const authority = new URL(configured.includes('://') ? configured : `http://${configured}`).host;
  const baseURL = `http://${authority}/${locale}`;
  return {
    origin: new URL(baseURL).origin,
    testInfo: {
      ...testInfo,
      project: { ...testInfo.project, use: { ...testInfo.project.use, baseURL } },
    } as TestInfo,
  };
}
test.describe('IDA-UI03a2-B1 saved draft canonical submit', () => {
  test('submits one resumed draft and preserves its independent source', async ({
    browser,
  }, testInfo) => {
    // prettier-ignore
    test.skip(testInfo.project.name !== 'gate-ks-sq', 'Canonical residue is bounded to one project');
    const ida = resolveIdaTarget(testInfo);
    const consentOrigin = new URL(ida.origin);
    // prettier-ignore
    const consentCookie = { domain: consentOrigin.hostname, expires: -1, httpOnly: false, name: 'cookie_consent', path: '/', sameSite: 'Lax' as const, secure: consentOrigin.protocol === 'https:', value: 'necessary' };
    // prettier-ignore
    const primaryContext = await browser.newContext({ extraHTTPHeaders: pilotHeaders, storageState: { cookies: [consentCookie], origins: [] } });
    const page = await primaryContext.newPage();
    try {
      await freshLogin(page, ida.origin, routes.login(ida.testInfo));
      await gotoApp(page, routes.memberMembership(ida.testInfo), ida.testInfo, {
        marker: 'membership-page-ready',
      });
      await expect(
        page
          .getByTestId('ops-status-badge')
          .filter({ hasText: /active|aktiv|актив/i })
          .first()
      ).toBeVisible();
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
      // prettier-ignore
      const freshContext = await browser.newContext({ extraHTTPHeaders: pilotHeaders, storageState: { cookies: [consentCookie], origins: [] } });
      const resumedPage = await freshContext.newPage();
      try {
        await freshLogin(resumedPage, ida.origin, routes.login(ida.testInfo));
        await gotoApp(resumedPage, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
          marker: 'new-claim-page-ready',
        });
        expect(await resumedPage.evaluate(() => localStorage.length)).toBe(0);
        const resumedIntake = visibleIntake(resumedPage);
        await resumedIntake.getByTestId('free-start-manage-open').click();
        await resumedPage.getByTestId(`free-start-resume-${exactDraftId}`).click();
        await expectPreservedFacts(resumedIntake);
        const submit = resumedIntake.getByTestId('claim-draft-submit');
        await expect(submit).toBeEnabled();
        await submit.click();
        const success = resumedPage.getByTestId('claim-created-success');
        await expect(success).toContainText(sq.claims.wizard.submit_success, { timeout: 15_000 });
        const claimNumber = await success.getAttribute('data-claim-number');
        expect(claimNumber).toMatch(/^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/);
        testInfo.annotations.push({
          type: 'permanent-residue',
          description: `Canonical claim ${claimNumber} and normal member notification retained; source draft ${exactDraftId} retained.`,
        });
        const claimLink = success.locator('a');
        const claimHref = await claimLink.getAttribute('href');
        expect(claimHref).toMatch(
          new RegExp(`^/${routes.getLocale(ida.testInfo)}/member/claims/fsd_[a-f0-9]{64}$`)
        );
        await claimLink.click();
        await expect(resumedPage.getByTestId('member-claim-progress-summary')).toBeVisible();
        await gotoApp(resumedPage, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
          marker: 'new-claim-page-ready',
        });
        const retainedIntake = visibleIntake(resumedPage);
        await retainedIntake.getByTestId('free-start-manage-open').click();
        const retainedResume = resumedPage.getByTestId(`free-start-resume-${exactDraftId}`);
        await expect(retainedResume).toBeVisible();
        await retainedResume.click();
        await expectPreservedFacts(retainedIntake);
        await expect(retainedIntake.getByTestId('claim-draft-submit')).toBeEnabled();
      } finally {
        await freshContext.close();
      }
    } finally {
      await primaryContext.close();
    }
  });
});
