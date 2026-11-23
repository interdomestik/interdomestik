import { account, db, eq, session as authSession, user } from '@interdomestik/database';
import { expect, test } from '@playwright/test';

test.describe('SEC-AUTH01 Better Auth authority gate', () => {
  test('signup is canonical and generic update is atomic', async ({ browser }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL?.toString();
    if (!baseURL) throw new Error('Project baseURL is required');
    const origin = new URL(baseURL).origin;
    const isMk = testInfo.project.name.includes('mk');
    const tenant = isMk ? 'tenant_mk' : 'tenant_ks';
    const hostileTenant = isMk ? 'tenant_ks' : 'tenant_mk';
    const hostileBranch = isMk ? 'ks_branch_a' : 'mk_branch_a';
    const email = `sec-auth01-${testInfo.project.name}-${Date.now()}@example.com`;
    const context = await browser.newContext({
      baseURL: origin,
      extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
      storageState: { cookies: [], origins: [] },
    });

    try {
      const created = await context.request.post('/api/auth/sign-up/email', {
        data: {
          email,
          password: 'Password123!',
          name: 'Authority Original',
          onboarding: { tenant, mode: 'resolved' },
          role: 'super_admin',
          tenantId: hostileTenant,
          branchId: hostileBranch,
          memberNumber: 'ATTACKER',
          tenantClassificationPending: true,
          agentId: 'agent-attacker',
          referralCode: 'OWNED',
        },
        headers: { Origin: origin, Referer: `${baseURL}/register` },
      });
      expect(created.status(), await created.text()).toBe(200);
      const createdBody = await created.json();
      expect(createdBody.user).toMatchObject({
        role: 'member',
        tenantId: tenant,
        branchId: null,
        tenantClassificationPending: false,
        agentId: null,
        referralCode: null,
      });
      expect(createdBody.user.memberNumber).not.toBe('ATTACKER');

      const before = await db.query.user.findFirst({ where: eq(user.email, email) });
      expect(before).toBeDefined();
      const denied = await context.request.post('/api/auth/update-user', {
        data: { name: 'Poisoned', role: 'super_admin' },
        headers: { Origin: origin, Referer: `${baseURL}/member/profile` },
      });
      expect(denied.status()).toBe(400);
      expect(await denied.json()).toMatchObject({ code: 'AUTHORITY_FIELD_NOT_WRITABLE' });
      expect(denied.headers()['set-cookie']).toBeUndefined();
      const afterDenied = await db.query.user.findFirst({ where: eq(user.email, email) });
      expect(afterDenied).toEqual(before);

      const safe = await context.request.post('/api/auth/update-user', {
        data: { name: 'Authority Changed', image: 'https://example.test/a.png' },
        headers: { Origin: origin, Referer: `${baseURL}/member/profile` },
      });
      expect(safe.status(), await safe.text()).toBe(200);
      const afterSafe = await db.query.user.findFirst({ where: eq(user.email, email) });
      expect(afterSafe).toMatchObject({
        name: 'Authority Changed',
        role: before?.role,
        tenantId: before?.tenantId,
        branchId: before?.branchId,
        agentId: before?.agentId,
      });
    } finally {
      const created = await db.query.user.findFirst({
        where: eq(user.email, email),
        columns: { id: true },
      });
      if (created) {
        await db.delete(account).where(eq(account.userId, created.id));
        await db.delete(authSession).where(eq(authSession.userId, created.id));
        await db.delete(user).where(eq(user.id, created.id));
      }
      await context.close();
    }
  });
});
