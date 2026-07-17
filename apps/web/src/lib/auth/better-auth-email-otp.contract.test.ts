import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupContractRows,
  contractAuth,
  cookieHeaderFrom,
  insertRegisteredUser,
  queryTrace,
  send,
  sqlClient,
  uniqueEmail,
  verify,
} from './better-auth-email-otp.contract-test-support';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupContractRows();
});
afterAll(async () => sqlClient.end());

describe.runIf(process.env.REQUIRE_BETTER_AUTH_OTP_CONTRACT === '1')(
  'Better Auth 1.6.22 frozen Drizzle OTP contract',
  () => {
    it('C09 gives registered and unregistered send the same real-adapter operation trace', async () => {
      const auth = contractAuth();
      await send(auth, uniqueEmail('warmup'));
      const registered = uniqueEmail('registered');
      const unregistered = uniqueEmail('unregistered');
      await insertRegisteredUser(registered);

      queryTrace.length = 0;
      const registeredResponse = await send(auth, registered);
      const registeredTrace = [...queryTrace];
      queryTrace.length = 0;
      const unregisteredResponse = await send(auth, unregistered);

      expect(await registeredResponse.json()).toEqual({ success: true });
      expect(await unregisteredResponse.json()).toEqual({ success: true });
      expect(queryTrace).toEqual(registeredTrace);
    });

    it('C10 stores no recoverable submitted code in the Drizzle verification row', async () => {
      const auth = contractAuth();
      const email = uniqueEmail('hashed');
      await send(auth, email);
      const rows = await sqlClient<{ value: string }[]>`
      select "value" from "verification" where "identifier" like ${`%${email}`}
    `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.value).not.toContain('123456');
      expect(rows[0]?.value).toMatch(/:0$/);
    });

    it('C11 exhausts the verifier after the third wrong attempt', async () => {
      const auth = contractAuth();
      const email = uniqueEmail('attempts');
      await send(auth, email);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await verify(auth, email, '000000')).status).toBe(400);
      }
      const attempts = await sqlClient<{ value: string }[]>`
      select "value" from "verification" where "identifier" like ${`%${email}`}
    `;
      expect(attempts[0]?.value).toMatch(/:3$/);
      expect((await verify(auth, email, '123456')).status).toBe(403);
      const exhausted = await sqlClient`
      select 1 from "verification" where "identifier" like ${`%${email}`}
    `;
      expect(exhausted).toHaveLength(0);
    });

    it('C12 atomically signs in once, exposes raw token/new cookie, re-reads and revokes only that row', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      const auth = contractAuth();
      const email = uniqueEmail('session');
      await send(auth, email);
      const responses = await Promise.all([
        verify(auth, email, '123456'),
        verify(auth, email, '123456'),
      ]);
      const success = responses.find(response => response.status === 200);
      expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
      expect(success).toBeDefined();

      const data = (await success?.clone().json()) as { token: string; user: { id: string } };
      const cookie = cookieHeaderFrom(success as Response);
      expect(data.token).toMatch(/\S+/);
      expect(cookie).toContain('better-auth.session_token=');

      const survivor = `survivor-${randomUUID()}`;
      await sqlClient`
      insert into "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
      values (${randomUUID()}, now() + interval '1 hour', ${survivor}, now(), now(), ${data.user.id})
    `;
      const headers = new Headers({ cookie });
      queryTrace.length = 0;
      const fresh = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      expect(fresh?.user.id).toBe(data.user.id);
      expect(queryTrace.some(query => query.includes('from "session"'))).toBe(true);

      await auth.api.revokeSession({ body: { token: data.token }, headers });
      const remaining = await sqlClient<{ token: string }[]>`
      select "token" from "session" where "userId" = ${data.user.id}
    `;
      expect(remaining.map(row => row.token)).toContain(survivor);
      expect(remaining.map(row => row.token)).not.toContain(data.token);
      expect((await verify(auth, email, '123456')).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    });
  }
);
