import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  claims,
  db,
  eq,
  freeStartDrafts,
} from '@interdomestik/database';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { expect } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  S3_JOURNEY_INCIDENT_DATE,
  exactClaimDescription,
  type S3JourneyIdentity,
} from './member-staff-evidence-journey-cleanup.fixture';

const facts = {
  category: 'vehicle',
  date: S3_JOURNEY_INCIDENT_DATE,
  issue: 'collision',
  outcome: 'repair',
} as const;

const visibleIntake = (page: Page) =>
  page.locator('[data-testid="claim-draft-intake"]:visible').first();

export async function submitExactDraft(
  memberPage: Page,
  testInfo: TestInfo,
  memberBaseURL: string,
  journey: S3JourneyIdentity,
  rememberClaimId: (claimId: string) => void
) {
  await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
    baseURL: memberBaseURL,
    marker: 'new-claim-page-ready',
  });
  const intake = visibleIntake(memberPage);
  const panel = intake.getByTestId('claim-draft-main-panel');
  await intake.getByTestId(`claim-draft-category-${facts.category}`).click();
  await intake.getByTestId('claim-draft-category-continue').click();
  await panel.locator(`select:has(option[value="${facts.issue}"])`).selectOption(facts.issue);
  await panel.getByLabel('Kur ndodhi?').fill(facts.date);
  await panel.getByLabel('Me kë po merresh?').fill(journey.counterparty);
  await panel.locator(`select:has(option[value="${facts.outcome}"])`).selectOption(facts.outcome);
  await panel.getByLabel('Përmbledhje e shkurtër').fill(journey.summary);
  await panel.getByRole('button', { name: 'Shikoni përmbledhjen', exact: true }).click();
  await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
  await intake.getByTestId('free-start-save-open').click();
  await expect(intake.getByTestId('free-start-save-status')).toHaveAttribute('data-state', 'saved');
  await intake.getByTestId('free-start-manage-open').click();
  const exactDraft = memberPage.locator('[data-testid^="free-start-draft-"]').filter({
    hasText: journey.summary,
  });
  await expect(exactDraft).toHaveCount(1);
  const draft = await db.query.freeStartDrafts.findFirst({
    where: and(
      eq(freeStartDrafts.tenantId, E2E_USERS.KS_MEMBER.tenantId),
      eq(freeStartDrafts.summary, journey.summary)
    ),
    columns: { id: true, ownerUserId: true },
  });
  if (!draft) throw new Error('Exact saved draft missing before S3 submission');
  await exactDraft.locator('[data-testid^="free-start-resume-"]').click();
  const submit = intake.getByTestId('claim-draft-submit');
  await expect(submit).toBeEnabled();
  await submit.click();
  let claimId: string | undefined;
  await expect
    .poll(async () => {
      const createdClaim = await db.query.claims.findFirst({
        where: and(
          eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId),
          eq(claims.userId, draft.ownerUserId),
          eq(claims.description, exactClaimDescription(journey))
        ),
        columns: { id: true },
      });
      claimId = createdClaim?.id;
      return claimId;
    })
    .toMatch(/^fsd_[a-f0-9]{64}$/u);
  rememberClaimId(claimId!);
  const success = memberPage.getByTestId('claim-created-success');
  await expect(success).toBeVisible({ timeout: 15_000 });
  const claimNumber = await success.getAttribute('data-claim-number');
  expect(claimNumber).toMatch(/^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/);
  const claimHref = await success.locator('a').getAttribute('href');
  if (!claimHref) throw new Error('Created claim success link is missing');
  expect(claimHref).toBe(routes.memberClaimDetail(claimId!, testInfo));
  return { claimId: claimId!, claimNumber: claimNumber!, claimHref };
}

export async function establishDraftTenantContext(
  memberPage: Page,
  baseURL: string,
  locale: string
) {
  const origin = new URL(baseURL).origin;
  const response = await memberPage.request.post(`${origin}/api/auth/sign-in/email`, {
    data: {
      email: E2E_USERS.KS_MEMBER.email,
      password: E2E_PASSWORD,
      additionalData: { tenantId: E2E_USERS.KS_MEMBER.tenantId },
    },
    headers: {
      Origin: origin,
      Referer: `${origin}${routes.login(locale)}`,
      'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId,
    },
  });
  expect(response.ok()).toBe(true);
}

export function idaBaseURL(testInfo: TestInfo): string {
  const projectBaseURL = testInfo.project.use.baseURL;
  if (!projectBaseURL) throw new Error('Gate project baseURL missing');
  const projectPort = new URL(projectBaseURL).port;
  const configured =
    process.env.IDA_HOST?.trim() || `ida.127.0.0.1.nip.io${projectPort ? `:${projectPort}` : ''}`;
  const url = new URL(configured.includes('://') ? configured : `http://${configured}`);
  if (!url.port && projectPort) url.port = projectPort;
  return `${url.origin}/${routes.getLocale(testInfo)}`;
}

export async function openMemberContext(
  browser: Browser,
  baseURL: string
): Promise<{ context: BrowserContext; page: Page }> {
  const origin = new URL(baseURL);
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId },
    storageState: {
      cookies: [
        {
          domain: origin.hostname,
          expires: -1,
          httpOnly: false,
          name: 'cookie_consent',
          path: '/',
          sameSite: 'Lax',
          secure: origin.protocol === 'https:',
          value: 'necessary',
        },
      ],
      origins: [],
    },
  });
  return { context, page: await context.newPage() };
}
