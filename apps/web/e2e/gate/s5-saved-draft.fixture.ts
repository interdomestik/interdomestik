import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  auditLog,
  claims,
  commercialActionIdempotency as idempotency,
  db,
  eq,
  freeStartDrafts,
  ilike,
  inArray,
  or,
  session as authSession,
  user,
} from '@interdomestik/database';
import { type FreeStartDraftContext } from '@interdomestik/database/free-start-drafts';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import {
  cleanupJourney,
  exactClaimDescription,
  type S3JourneyIdentity,
} from './member-staff-evidence-journey-cleanup.fixture';

export type S5Member = { email: string; tenantId: string };
export type S5Session = { page: Page; token: string };

// Golden-seeded active member in the same tenant as E2E_USERS.KS_MEMBER.
export const KS_MEMBER_A2: S5Member = {
  email: 'member.ks.a2@interdomestik.com',
  tenantId: E2E_USERS.KS_MEMBER.tenantId,
};

// The free-start and secure-save surface is served on the neutral IDA host.
export function idaTarget(info: TestInfo): TestInfo {
  const configured = process.env.IDA_HOST?.trim() || 'ida.127.0.0.1.nip.io:3000';
  const target = new URL(configured.includes('://') ? configured : `http://${configured}`);
  if (target.hostname === 'ida.127.0.0.1.nip.io') target.hostname = 'ida.localhost';
  const baseURL = `${target.origin}${routes.home('en')}`;
  const use = { ...info.project.use, baseURL, extraHTTPHeaders: {} };
  return { ...info, project: { ...info.project, use } } as TestInfo;
}

export function idaOrigin(info: TestInfo): string {
  return new URL(String(info.project.use.baseURL)).origin;
}

async function authPost(page: Page, info: TestInfo, path: string, data: unknown, tenant: string) {
  const origin = idaOrigin(info);
  const response = await page.request.post(`${origin}/api/auth/${path}`, {
    data,
    failOnStatusCode: false,
    headers: {
      Origin: process.env.BETTER_AUTH_URL?.trim() || origin,
      Referer: `${origin}${routes.login('en')}`,
      'x-tenant-id': tenant,
    },
    maxRedirects: 0,
  });
  return {
    body: (await response.json().catch(() => null)) as { token?: unknown } | null,
    response,
  };
}

export async function signIn(page: Page, info: TestInfo, member: S5Member): Promise<S5Session> {
  const { tenantId } = member;
  const result = await authPost(
    page,
    info,
    'sign-in/email',
    { additionalData: { tenantId }, email: member.email, password: E2E_PASSWORD },
    tenantId
  );
  const token = result.body?.token;
  if (!result.response.ok() || typeof token !== 'string')
    throw new Error(`sign-in failed: ${result.response.status()} ${JSON.stringify(result.body)}`);
  return { page, token };
}

export async function signOut(session: S5Session) {
  const revoked = await db
    .delete(authSession)
    .where(eq(authSession.token, session.token))
    .returning({ id: authSession.id });
  expect(revoked, 'the run session was revoked').toHaveLength(1);
}

// Project contexts carry country-host headers; these contexts must present only the IDA host.
export async function newPage(browser: Browser, info: TestInfo) {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: {},
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

export async function ownerContext(member: S5Member): Promise<FreeStartDraftContext> {
  const row = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, member.email),
  });
  if (!row) throw new Error(`missing seeded member ${member.email}`);
  const tenant = member.tenantId;
  return { accessTenantId: tenant, actorRole: 'member', ownerUserId: row.id, tenantId: tenant };
}

export function journeyClaims(journey: S3JourneyIdentity) {
  return db.query.claims.findMany({
    columns: { id: true, userId: true },
    where: and(
      eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId),
      eq(claims.description, exactClaimDescription(journey))
    ),
  });
}

export async function openSavedDrafts(page: Page, info: TestInfo) {
  await gotoApp(page, routes.member('en'), info, { marker: 'member-dashboard-ready' });
  await gotoApp(page, `${routes.memberNewClaim('en')}?mode=drafts`, info, {
    marker: 'new-claim-page-ready',
  });
  const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
  await intake.getByTestId('free-start-manage-open').click();
  await expect(intake.getByRole('heading', { name: 'Your saved drafts' })).toBeFocused();
  return intake;
}

// Deletes the run's draft audit and submit keys (matched by draft id), which journeys do not own.
export async function cleanupS5(claimId: string | null, journey: S3JourneyIdentity) {
  const tenant = E2E_USERS.KS_MEMBER.tenantId;
  const drafts = await db.query.freeStartDrafts.findMany({
    columns: { id: true },
    where: and(eq(freeStartDrafts.tenantId, tenant), eq(freeStartDrafts.summary, journey.summary)),
  });
  const ids = drafts.map(draft => draft.id);
  let cleared = 0;
  if (ids.length) {
    const audit = and(eq(auditLog.tenantId, tenant), inArray(auditLog.entityId, ids));
    const keys = or(...ids.map(id => ilike(idempotency.idempotencyKey, `%:${id}`)));
    const submits = and(eq(idempotency.tenantId, tenant), keys);
    cleared = (await db.delete(auditLog).where(audit).returning({ id: auditLog.id })).length;
    await db.delete(idempotency).where(submits);
  }
  await cleanupJourney(claimId, journey);
  expect(cleared, 'draft audit rows matched').toBeGreaterThanOrEqual(ids.length);
}

// Attempts every teardown step, then surfaces teardown failures without hiding the test's own error.
export async function teardown(steps: Array<() => Promise<unknown>>, testError?: unknown) {
  const failures: unknown[] = [];
  for (const step of steps) await step().catch(error => failures.push(error));
  if (!failures.length) return;
  const report = new AggregateError(failures, `teardown failed (${failures.length})`);
  if (testError === undefined) throw report;
  console.error(report);
  test.info().annotations.push({ type: 'teardown-error', description: String(report) });
}
