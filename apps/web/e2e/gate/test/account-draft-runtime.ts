import { resolvePlaywrightNetwork } from '../../../playwright-network';
import {
  E2E_PASSWORD,
  E2E_USERS,
  and,
  auditLog,
  claims,
  dbAdmin as db,
  eq,
  freeStartDrafts,
  memberLeads,
  subscriptions,
  user,
} from '@interdomestik/database';
import {
  deleteFreeStartDraft,
  type FreeStartDraftContext,
} from '@interdomestik/database/free-start-drafts';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { gotoApp } from '../../utils/navigation';
import { routes } from '../../routes';
import { interactiveLogin, normalLogout } from './login-handoff-page';
import { passiveRoleObserver } from './login-handoff-observer';

export function neutralTarget(info: TestInfo) {
  const host =
    process.env.IDA_HOST?.trim() || `ida.127.0.0.1.nip.io:${resolvePlaywrightNetwork().PORT}`;
  const origin = new URL(host.includes('://') ? host : `http://${host}`).origin;
  return {
    ...info,
    project: {
      ...info.project,
      use: { ...info.project.use, baseURL: `${origin}${routes.home('en')}`, extraHTTPHeaders: {} },
    },
  } as TestInfo;
}
export async function unpaidOwner(secondary = false) {
  const email = secondary ? 'member.ks.a3@interdomestik.com' : E2E_USERS.KS_MEMBER_EMPTY.email;
  const rows = await db.query.user.findMany({
    columns: { id: true, role: true, tenantId: true, emailVerified: true },
    where: and(eq(user.email, email), eq(user.tenantId, 'tenant_ks')),
  });
  expect(rows).toHaveLength(1);
  const owner = rows[0]!;
  const verifiedMember =
    owner.emailVerified === true && owner.role === 'member' && owner.tenantId === 'tenant_ks';
  expect(verifiedMember).toBe(true);
  const memberships = await db.query.subscriptions.findMany({
    columns: { id: true },
    where: and(eq(subscriptions.userId, owner.id), eq(subscriptions.tenantId, 'tenant_ks')),
  });
  expect(memberships).toHaveLength(0);
  return {
    ownerUserId: owner.id,
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
    actorRole: 'member',
  } as const;
}
export async function sideEffects(context: FreeStartDraftContext) {
  const [cases, memberships, leads] = await Promise.all([
    db.query.claims.findMany({
      columns: { id: true },
      where: and(eq(claims.userId, context.ownerUserId), eq(claims.tenantId, context.tenantId)),
    }),
    db.query.subscriptions.findMany({
      columns: { id: true },
      where: and(
        eq(subscriptions.userId, context.ownerUserId),
        eq(subscriptions.tenantId, context.tenantId)
      ),
    }),
    db.query.memberLeads.findMany({
      columns: { id: true },
      where: and(
        eq(memberLeads.email, E2E_USERS.KS_MEMBER_EMPTY.email),
        eq(memberLeads.tenantId, context.tenantId)
      ),
    }),
  ]);
  return { cases: cases.length, memberships: memberships.length, leads: leads.length };
}
export async function normalMemberLogin(
  page: Page,
  info: TestInfo,
  locale: string,
  secondary = false
) {
  await gotoApp(page, `/${locale}/login`, info, { marker: 'auth-ready' });
  await interactiveLogin(page, locale);
  const observer = await passiveRoleObserver(page, new URL(page.url()).origin, 'member', false);
  try {
    await page
      .getByTestId('login-email')
      .fill(secondary ? 'member.ks.a3@interdomestik.com' : E2E_USERS.KS_MEMBER_EMPTY.email);
    await page.getByTestId('login-password').fill(E2E_PASSWORD);
    const password = page.waitForResponse(
      r =>
        new URL(r.url()).pathname === '/api/auth/sign-in/email' && r.request().method() === 'POST'
    );
    await page.getByTestId('login-submit').click();
    expect((await password).status()).toBe(200);
    await expect.poll(() => observer.read()?.validated === true).toBe(true);
    await expect(page.getByTestId('member-dashboard-ready')).toBeVisible();
  } finally {
    await observer.close();
  }
}
export async function logout(page: Page, info: TestInfo, locale: string) {
  await gotoApp(page, `/${locale}/member`, info, { marker: 'member-dashboard-ready' });
  await normalLogout(page, locale);
}
export async function runDrafts(context: FreeStartDraftContext, summary: string) {
  return await db.query.freeStartDrafts.findMany({
    columns: { id: true, version: true, summary: true, category: true },
    where: and(
      eq(freeStartDrafts.ownerUserId, context.ownerUserId),
      eq(freeStartDrafts.accessTenantId, context.accessTenantId),
      eq(freeStartDrafts.summary, summary)
    ),
  });
}
export async function cleanupDraft(context: FreeStartDraftContext, ids: Set<string>) {
  // Keep cleanup fail-fast and serial: each scoped version read precedes its delete and audit cleanup.
  await [...ids].reduce(
    (previous, id) => previous.then(() => cleanupOneDraft(context, id)),
    Promise.resolve()
  );
}
async function cleanupOneDraft(context: FreeStartDraftContext, id: string) {
  const rows = await db.query.freeStartDrafts.findMany({
    columns: { version: true },
    where: and(
      eq(freeStartDrafts.id, id),
      eq(freeStartDrafts.ownerUserId, context.ownerUserId),
      eq(freeStartDrafts.accessTenantId, context.accessTenantId)
    ),
  });
  if (rows.length === 1)
    expect(
      (await deleteFreeStartDraft(context, { id, expectedVersion: rows[0]!.version })).ok
    ).toBe(true);
  await db
    .delete(auditLog)
    .where(and(eq(auditLog.tenantId, context.tenantId), eq(auditLog.entityId, id)));
}
