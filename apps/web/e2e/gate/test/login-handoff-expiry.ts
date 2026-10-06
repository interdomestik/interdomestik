import { and, dbAdmin, eq, session, user } from '@interdomestik/database';
import { expect, type Page } from '@playwright/test';
import { type heldLogin } from './login-handoff-session';

export async function expireOwnedSession(page: Page, login: Awaited<ReturnType<typeof heldLogin>>) {
  // Fixed supported owned test mappings: this task's local fixture and versioned CI service.
  const url = new URL(process.env.DATABASE_URL ?? '');
  const app = new URL(page.url());
  const localHost =
    app.hostname === '127.0.0.1' ||
    app.hostname === 'localhost' ||
    app.hostname.endsWith('.127.0.0.1.nip.io');
  const localDB =
    url.hostname === '127.0.0.1' && url.port === '55438' && url.pathname === '/interdomestik_test';
  const ciDB =
    (process.env.CI === 'true' || process.env.CI === '1') &&
    url.hostname === '127.0.0.1' &&
    url.port === '5432' &&
    url.pathname === '/interdomestik_test';
  if (
    app.protocol !== 'http:' ||
    !localHost ||
    (!localDB && !ciDB) ||
    !login.token ||
    !login.ownerId
  )
    throw Error('owned expiry fixture guard failed');
  const token = login.token;
  const ownerId = login.ownerId;
  try {
    const owned = await dbAdmin
      .select({ id: session.id, expiresAt: session.expiresAt, createdAt: session.createdAt })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(
        and(
          eq(session.token, token),
          eq(session.userId, ownerId),
          eq(user.email, login.identity.email),
          eq(user.tenantId, login.identity.tenantId)
        )
      );
    expect(owned.length).toBe(1);
    const fresh = owned[0];
    expect(
      fresh.createdAt.getTime() >= login.startedAt - 5000 &&
        fresh.createdAt.getTime() <= Date.now() + 5000
    ).toBe(true);
    const expiredAt = new Date(Date.now() - 60_000);
    const where = and(
      eq(session.id, fresh.id),
      eq(session.token, token),
      eq(session.userId, ownerId)
    );
    const changed = await dbAdmin
      .update(session)
      .set({ expiresAt: expiredAt })
      .where(where)
      .returning({ id: session.id });
    expect(changed.length).toBe(1);
    return async () => {
      try {
        const present = await dbAdmin
          .select({ expiresAt: session.expiresAt })
          .from(session)
          .where(where);
        expect(present.length <= 1).toBe(true);
        if (present.length === 0) return false; // Server verifier may remove the expired row.
        expect(present[0].expiresAt.getTime() === expiredAt.getTime()).toBe(true);
        const restored = await dbAdmin
          .update(session)
          .set({ expiresAt: fresh.expiresAt })
          .where(and(where, eq(session.expiresAt, expiredAt)))
          .returning({ id: session.id });
        expect(restored.length).toBe(1);
        return true;
      } catch {
        throw Error('owned expiry fixture restoration failed');
      }
    };
  } catch {
    throw Error('owned expiry fixture setup failed');
  }
}
