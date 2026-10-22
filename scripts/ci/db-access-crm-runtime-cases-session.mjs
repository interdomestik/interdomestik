import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

export async function runCrmSessionCases() {
  const { auth, dbAdmin, session } = await import('./crm-runtime.cjs');
  const context = await auth.$context;
  assert.equal(context.secret, process.env.BETTER_AUTH_SECRET);
  const cookieName = context.authCookies.sessionToken.name;
  const signed = token =>
    encodeURIComponent(
      token + '.' + createHmac('sha256', context.secret).update(token).digest('base64')
    );
  const get = cookie =>
    auth.api.getSession({
      headers: new Headers({
        host: 'ida.localhost:3000',
        ...(cookie ? { cookie: cookieName + '=' + cookie } : {}),
      }),
    });
  const now = new Date();
  const identities = [
    { userId: 'crm-admin-KS', tenantId: 'tenant_ks', role: 'admin' },
    { userId: 'crm-agent-MK', tenantId: 'tenant_mk', role: 'agent' },
  ];
  for (const [index, expected] of identities.entries()) {
    const token = 'crm-session-' + randomBytes(24).toString('hex');
    await dbAdmin.insert(session).values({
      id: 'owned-session-proof-' + index,
      token,
      userId: expected.userId,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    });
    const result = await get(signed(token));
    assert.equal(result?.session.userId, expected.userId);
    assert.equal(result?.user.id, expected.userId);
    assert.equal(result?.user.tenantId, expected.tenantId);
    assert.equal(result?.user.role, expected.role);
    assert.equal(await get(signed(token) + 'tampered'), null);
  }
  assert.equal(await get(), null);
  assert.equal(await get(signed('nonexistent-fixture-token')), null);
  const expiredToken = 'crm-expired-' + randomBytes(24).toString('hex');
  await dbAdmin.insert(session).values({
    id: 'owned-session-expired',
    token: expiredToken,
    userId: identities[0].userId,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() - 60000),
  });
  assert.equal(await get(signed(expiredToken)), null);
  return [
    'configured-session-api-executed',
    'persisted-user-tenant-role-associated',
    'tampered-signature-rejected',
    'absent-and-unknown-session-rejected',
    'expired-session-rejected',
  ];
}
