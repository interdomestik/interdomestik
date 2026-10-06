import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  claims,
  db,
  desc,
  eq,
  freeStartDrafts,
  inArray,
} from '@interdomestik/database';
import type { Browser, BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
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

/**
 * Reads the signed-in actor through the native better-auth session endpoint so every read-only
 * snapshot below is scoped to the exact owner.
 */
async function readSessionOwnerUserId(memberPage: Page, memberBaseURL: string): Promise<string> {
  const origin = new URL(memberBaseURL).origin;
  const response = await memberPage.request.get(`${origin}/api/auth/get-session`, {
    headers: { 'x-tenant-id': E2E_USERS.KS_MEMBER.tenantId },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { user?: { email?: unknown; id?: unknown } } | null;
  expect(body?.user?.email).toBe(E2E_USERS.KS_MEMBER.email);
  const ownerUserId = body?.user?.id;
  if (typeof ownerUserId !== 'string' || ownerUserId.length === 0) {
    throw new Error('S3 member session owner missing');
  }
  return ownerUserId;
}

/** Native draft list scope: access tenant plus owner (schema CHECK keeps tenantId equal). */
const ownedDraftScope = (ownerUserId: string) =>
  and(
    eq(freeStartDrafts.accessTenantId, E2E_USERS.KS_MEMBER.tenantId),
    eq(freeStartDrafts.ownerUserId, ownerUserId)
  );

const ownedClaimScope = (ownerUserId: string) =>
  and(eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId), eq(claims.userId, ownerUserId));

/** Read-only full owner inventory in native list order (updatedAt DESC, id DESC); no cap. */
async function readOwnedDrafts(ownerUserId: string) {
  return db.query.freeStartDrafts.findMany({
    where: ownedDraftScope(ownerUserId),
    orderBy: [desc(freeStartDrafts.updatedAt), desc(freeStartDrafts.id)],
  });
}

async function readExactOwnedDrafts(ownerUserId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.query.freeStartDrafts.findMany({
    where: and(ownedDraftScope(ownerUserId), inArray(freeStartDrafts.id, [...ids])),
    orderBy: [desc(freeStartDrafts.updatedAt), desc(freeStartDrafts.id)],
  });
}

async function readOwnedClaims(ownerUserId: string) {
  return db.query.claims.findMany({
    where: ownedClaimScope(ownerUserId),
    orderBy: [desc(claims.id)],
  });
}

async function readExactOwnedClaims(ownerUserId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.query.claims.findMany({
    where: and(ownedClaimScope(ownerUserId), inArray(claims.id, [...ids])),
    orderBy: [desc(claims.id)],
  });
}

const sortedIds = (ids: readonly string[]): string[] =>
  [...ids].sort((left, right) => left.localeCompare(right));

/** Observe native list completion; existing rows alone do not settle a later manager load. */
function nextOwnedDraftList(memberPage: Page, ownerUserId: string) {
  return memberPage.waitForResponse(response => {
    const request = response.request();
    if (request.method() !== 'POST') return false;
    try {
      const [input] = JSON.parse(request.postData() ?? 'null') as {
        cursor?: unknown;
        expectedContext?: { ownerUserId?: string; tenantId?: string };
      }[];
      return (
        input?.cursor === null &&
        input.expectedContext?.ownerUserId === ownerUserId &&
        input.expectedContext.tenantId === E2E_USERS.KS_MEMBER.tenantId
      );
    } catch {
      return false;
    }
  });
}

/**
 * Pre-navigation inventory distinguishes fresh, sole auto-resume, and multiple saved rows.
 * Start another retires the queue and resets only local state; nothing is deleted.
 */
async function settleFreshCategoryStage(
  memberPage: Page,
  intake: Locator,
  retainedDraftIds: readonly string[],
  ownerUserId: string
): Promise<void> {
  const [mostRecentDraftId] = retainedDraftIds;
  if (mostRecentDraftId) {
    if (retainedDraftIds.length > 1) {
      const managedList = nextOwnedDraftList(memberPage, ownerUserId);
      await intake.getByTestId('free-start-manage-open').click();
      const response = await managedList;
      expect(response.ok()).toBe(true);
      await expect(intake.getByTestId('account-draft-status')).not.toHaveAttribute(
        'data-state',
        'loading'
      );
      const resume = memberPage.getByTestId(`free-start-resume-${mostRecentDraftId}`);
      await expect(resume).toBeVisible();
      await resume.click();
    }
    const startAnother = intake.getByTestId('free-start-start-another');
    await expect(startAnother).toBeEnabled();
    const status = intake.getByTestId('account-draft-status');
    await expect(status).toHaveAttribute('data-state', 'saved');
    await startAnother.click();
    await expect(startAnother).toHaveCount(0);
  }
  await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
  await expect(intake.getByTestId(`claim-draft-category-${facts.category}`)).toBeEnabled();
  await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
  await expect(intake.getByTestId('claim-draft-category-continue')).toBeVisible();
}

export async function submitExactDraft(
  memberPage: Page,
  testInfo: TestInfo,
  memberBaseURL: string,
  journey: S3JourneyIdentity,
  rememberClaimId: (claimId: string) => void
) {
  const ownerUserId = await readSessionOwnerUserId(memberPage, memberBaseURL);
  const retainedDrafts = await readOwnedDrafts(ownerUserId);
  const retainedDraftIds = retainedDrafts.map(row => row.id);
  const retainedClaims = await readOwnedClaims(ownerUserId);
  const retainedClaimIds = retainedClaims.map(row => row.id);
  await gotoApp(memberPage, routes.memberNewClaim(testInfo), testInfo, {
    baseURL: memberBaseURL,
    marker: 'new-claim-page-ready',
  });
  const intake = visibleIntake(memberPage);
  const panel = intake.getByTestId('claim-draft-main-panel');
  if (retainedDraftIds.length > 0) {
    // This button requires accepted nonempty items; initial and zero-item views lack it.
    const status = intake.getByTestId('account-draft-status');
    await expect(status.getByRole('button')).toHaveCount(1);
    await expect(status).not.toHaveAttribute('data-state', 'loading');
  }
  await settleFreshCategoryStage(memberPage, intake, retainedDraftIds, ownerUserId);
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
  expect(draft.ownerUserId).toBe(ownerUserId);
  expect(retainedDraftIds).not.toContain(draft.id);
  expect(sortedIds((await readOwnedDrafts(ownerUserId)).map(row => row.id))).toEqual(
    sortedIds([...retainedDraftIds, draft.id])
  );
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
  expect(retainedClaimIds).not.toContain(claimId);
  expect(await readExactOwnedDrafts(ownerUserId, retainedDraftIds)).toEqual(retainedDrafts);
  expect(await readExactOwnedClaims(ownerUserId, retainedClaimIds)).toEqual(retainedClaims);
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
  const portSuffix = projectPort ? `:${projectPort}` : '';
  const configured = process.env.IDA_HOST?.trim() || `ida.127.0.0.1.nip.io${portSuffix}`;
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
