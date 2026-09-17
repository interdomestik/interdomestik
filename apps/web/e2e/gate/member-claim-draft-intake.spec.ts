import { E2E_PASSWORD, E2E_USERS } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import claimsSq from '../../src/messages/sq/claims.json';
import freeStartSq from '../../src/messages/sq/freeStart.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  cleanupJourney,
  expectJourneyClean,
  S3_JOURNEY_INCIDENT_DATE,
  type S3JourneyIdentity,
} from './member-staff-evidence-journey-cleanup.fixture';

const facts = {
  date: S3_JOURNEY_INCIDENT_DATE,
  issue: 'collision',
  outcome: 'repair',
} as const;
const pilotHeaders = { 'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId };
const draftCopy = JSON.parse(claimsSq.claims.draftIntakeCopy) as Record<string, string>;
const secureSaveCopy = JSON.parse(freeStartSq.freeStart.secureSave) as {
  recovery: { continue: string };
};

const visibleIntake = (page: Page) => page.locator('[data-testid="claim-draft-intake"]:visible');

async function expectSingleIntake(page: Page): Promise<Locator> {
  const intake = visibleIntake(page);
  await expect(intake).toHaveCount(1);
  await expect(intake).toBeVisible();
  return intake;
}

async function completePublicVehicleGuidance(page: Page): Promise<Locator> {
  const hero = page.getByTestId('public-entry-hero');
  await expect(hero).toHaveCount(1);
  await expect(hero.getByTestId('public-entry-situations')).toHaveCount(1);
  for (const id of ['vehicle', 'injury', 'property', 'flight'] as const) {
    await expect(hero.getByTestId(`public-entry-${id}`)).toHaveCount(1);
  }
  await hero.getByTestId('public-entry-vehicle').click();
  const guidance = page.getByTestId('accident-safety-journey');
  await expect(guidance).toHaveCount(1);
  await guidance.getByRole('button', { name: 'Jo, vetëm dëm material' }).click();
  await guidance.getByRole('button', { name: /Po, mund të lëvizet/i }).click();
  await guidance.getByLabel('Shteti ku ndodhi aksidenti').selectOption('IT');
  await guidance.getByRole('button', { name: 'Vazhdo', exact: true }).click();
  await guidance.getByLabel('Shteti i regjistrimit të veturës').selectOption('DE');
  await guidance.getByRole('button', { name: 'Vazhdo', exact: true }).click();
  await guidance.getByLabel('Shteti i siguruesit ose palës tjetër').selectOption('XK');
  await guidance.getByRole('button', { name: 'Vazhdo', exact: true }).click();
  await guidance.getByRole('button', { name: 'Organizo të dhënat e rastit' }).click();
  return expectSingleIntake(page);
}

async function fillSupportedDraft(intake: Locator, journey: S3JourneyIdentity): Promise<void> {
  const panel = intake.getByTestId('claim-draft-main-panel');
  await expect(panel.getByLabel('Përmbledhje e shkurtër')).toBeVisible();
  await panel.getByLabel('Çfarë ndodhi?').selectOption(facts.issue);
  await panel.getByLabel('Kur ndodhi?').fill(facts.date);
  await panel.getByLabel('Me kë po merresh?').fill(journey.counterparty);
  await panel.getByLabel('Çfarë dëshiron të rikuperosh?').selectOption(facts.outcome);
  await panel.getByLabel('Përmbledhje e shkurtër').fill(journey.summary);
  await panel.getByRole('button', { name: 'Shikoni përmbledhjen', exact: true }).click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
}

async function expectPreservedFacts(intake: Locator, journey: S3JourneyIdentity): Promise<void> {
  const reviewedFacts = intake.getByTestId('claim-draft-dormant-preview').locator('dd');
  await expect(reviewedFacts).toHaveCount(6);
  const expected = [
    freeStartSq.freeStart.categories.vehicle.title,
    freeStartSq.freeStart.issues.vehicle.collision,
    facts.date,
    journey.counterparty,
    freeStartSq.freeStart.outcomes.repair,
    journey.summary,
  ];
  for (const [index, value] of expected.entries()) {
    await expect(reviewedFacts.nth(index)).toHaveText(value);
  }
}

async function resumeExactDraft(
  page: Page,
  draftId: string,
  journey: S3JourneyIdentity
): Promise<Locator> {
  const intake = await expectSingleIntake(page);
  await intake.getByTestId('free-start-manage-open').click();
  const exactDraft = intake.locator('[data-testid^="free-start-draft-"]').filter({
    hasText: journey.summary,
  });
  await expect(exactDraft).toHaveCount(1);
  const resume = exactDraft.getByTestId(`free-start-resume-${draftId}`);
  await expect(resume).toHaveCount(1);
  await resume.click();
  await expectPreservedFacts(intake, journey);
  return intake;
}

async function freshLogin(page: Page, origin: string, loginPath: string): Promise<void> {
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email: E2E_USERS.KS_MEMBER.email,
      password: E2E_PASSWORD,
      additionalData: { tenantId: E2E_USERS.KS_MEMBER.tenantId },
    },
    headers: { Origin: origin, Referer: `${origin}${loginPath}`, ...pilotHeaders },
  });
  expect(response.ok(), await response.text()).toBe(true);
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

test.describe('S5 first-case continuity', () => {
  let residue: (S3JourneyIdentity & { claimId: string | null; contexts: BrowserContext[] }) | null;

  test.afterEach(async () => {
    if (!residue) return;
    await Promise.allSettled(residue.contexts.map(context => context.close()));
    await cleanupJourney(residue.claimId, residue);
    await expectJourneyClean(residue.claimId, residue);
    residue = null;
  });

  test('keeps six public facts through save, fresh-session submit, and case re-entry', async (
    { browser },
    testInfo
  ) => {
    test.skip(testInfo.project.name !== 'gate-ks-sq', 'Canonical residue is bounded to one project');
    expect(testInfo.config.workers).toBe(1);
    expect(testInfo.parallelIndex).toBe(0);
    test.setTimeout(120_000);
    testInfo.annotations.push({
      type: 'credited-receipt',
      description:
        'Verified-email OTP/account recovery is credited from the bounded S4 receipt; this gate reuses the active first-case member fixture and does not test membership activation.',
    });
    const ida = resolveIdaTarget(testInfo);
    const journeyId = randomUUID();
    residue = {
      claimId: null,
      contexts: [],
      counterparty: `S5 operator ${journeyId}`,
      summary: `S5 first-case continuity ${journeyId}`,
    };
    const consentOrigin = new URL(ida.origin);
    const consentCookie = {
      domain: consentOrigin.hostname,
      expires: -1,
      httpOnly: false,
      name: 'cookie_consent',
      path: '/',
      sameSite: 'Lax' as const,
      secure: consentOrigin.protocol === 'https:',
      value: 'necessary',
    };
    const primaryContext = await browser.newContext({
      extraHTTPHeaders: pilotHeaders,
      storageState: { cookies: [consentCookie], origins: [] },
    });
    residue.contexts.push(primaryContext);
    const page = await primaryContext.newPage();
    await gotoApp(page, routes.home(ida.testInfo), ida.testInfo, { marker: 'public-entry-hero' });
    const publicIntake = await completePublicVehicleGuidance(page);
    await fillSupportedDraft(publicIntake, residue);
    await expectPreservedFacts(publicIntake, residue);

    await freshLogin(page, ida.origin, routes.login(ida.testInfo));
    await page.reload();
    const authenticatedIntake = await expectSingleIntake(page);
    const recovery = authenticatedIntake.getByTestId('anonymous-draft-recovery-offer');
    await expect(recovery).toHaveCount(1);
    await recovery.getByRole('button', { name: secureSaveCopy.recovery.continue }).click();
    await expectPreservedFacts(authenticatedIntake, residue);
    await authenticatedIntake.getByTestId('free-start-save-open').click();
    await expect(authenticatedIntake.getByTestId('free-start-save-status')).toHaveAttribute(
      'data-state',
      'saved'
    );
    await authenticatedIntake.getByTestId('free-start-manage-open').click();
    const exactSavedDraft = authenticatedIntake
      .locator('[data-testid^="free-start-draft-"]')
      .filter({ hasText: residue.summary });
    await expect(exactSavedDraft).toHaveCount(1);
    const savedResume = exactSavedDraft.locator('[data-testid^="free-start-resume-"]');
    await expect(savedResume).toHaveCount(1);
    const exactDraftId = (await savedResume.getAttribute('data-testid'))?.replace(
      'free-start-resume-',
      ''
    );
    if (!exactDraftId) throw new Error('saved_draft_id_missing');

    const freshContext = await browser.newContext({
      extraHTTPHeaders: pilotHeaders,
      storageState: { cookies: [consentCookie], origins: [] },
    });
    residue.contexts.push(freshContext);
    const resumedPage = await freshContext.newPage();
    await freshLogin(resumedPage, ida.origin, routes.login(ida.testInfo));
    await gotoApp(resumedPage, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
      marker: 'new-claim-page-ready',
    });
    expect(await resumedPage.evaluate(() => localStorage.length)).toBe(0);
    const resumedIntake = await resumeExactDraft(resumedPage, exactDraftId, residue);
    const submit = resumedIntake.getByTestId('claim-draft-submit');
    await expect(submit).toHaveCount(1);
    await expect(submit).toBeEnabled();
    await submit.click();
    const success = resumedPage.getByTestId('claim-created-success');
    await expect(success).toContainText(claimsSq.claims.wizard.submit_success, {
      timeout: 15_000,
    });
    const claimNumber = await success.getAttribute('data-claim-number');
    expect(claimNumber).toMatch(/^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/);
    const claimLink = success.locator('a');
    await expect(claimLink).toHaveCount(1);
    const claimHref = await claimLink.getAttribute('href');
    expect(claimHref).toMatch(
      new RegExp(`^/${routes.getLocale(ida.testInfo)}/member/claims/fsd_[a-f0-9]{64}$`)
    );
    residue.claimId = claimHref?.split('/').at(-1) ?? null;
    if (!residue.claimId) throw new Error('created_claim_id_missing');
    await claimLink.click();
    await expect(resumedPage.getByTestId('member-claim-progress-summary')).toHaveCount(1);

    await gotoApp(resumedPage, routes.memberNewClaim(ida.testInfo), ida.testInfo, {
      marker: 'new-claim-page-ready',
    });
    const retainedIntake = await resumeExactDraft(resumedPage, exactDraftId, residue);
    const restored = retainedIntake.getByTestId('claim-created-success');
    await expect(restored).toContainText(draftCopy.existingCaseSuccess);
    await expect(restored).toHaveAttribute('data-claim-number', claimNumber!);
    await expect(restored.locator('a')).toHaveAttribute('href', claimHref!);
    await expect(retainedIntake.getByTestId('claim-draft-submit')).toHaveCount(0);
  });
});
