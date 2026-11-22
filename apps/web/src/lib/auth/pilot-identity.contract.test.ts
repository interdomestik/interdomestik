import { sql } from '@interdomestik/database';
import type { PilotSwitchKey } from '@interdomestik/database/pilot-switch';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-guard';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { resolveTenantClassificationCore } from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/auth/[...all]/route';
import {
  cleanupContractRows,
  contractAuth,
  send,
  sqlClient,
  uniqueEmail,
} from './better-auth-email-otp.contract-test-support';
import {
  challenges,
  defer,
  doorRequest,
  insertDoorAccount,
  pilotAuth,
  readDoorAccount,
  replacementPassword,
  sendRequest,
  signUpRequest,
  userCount,
  verifyRequest,
} from './pilot-identity.contract-test-support';

const wiring = vi.hoisted(() => ({
  handler: vi.fn(),
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  sendSignInOtpEmail: vi.fn(async () => ({ success: true })),
  sendPasswordResetEmail: vi.fn<(email: string, link: string) => Promise<void>>(),
  after: [] as Array<() => Promise<unknown> | void>,
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    handler: wiring.handler,
    api: { getSession: wiring.getSession, revokeSession: wiring.revokeSession },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null }));
vi.mock('@/lib/rate-limit-otp', () => ({ enforceOtpRateLimits: async () => null }));
vi.mock('@/lib/audit.core', () => ({ extractRequestMetadata: () => ({}) }));
vi.mock('next/server', () => ({
  after: (callback: () => Promise<unknown> | void) => {
    wiring.after.push(callback);
  },
}));
vi.mock('@/lib/email', () => ({
  normalizeSignInOtpLocale: () => 'en',
  sendSignInOtpEmail: wiring.sendSignInOtpEmail,
  sendPasswordResetEmail: wiring.sendPasswordResetEmail,
}));

const session = {
  user: { id: 'pilot-contract-admin', role: 'tenant_admin', tenantId: 'tenant_ks' },
};
const authority = mintTestTenantAuthority('tenant_ks', {
  userId: session.user.id,
  role: session.user.role,
});
const settingIds = { public_intake: randomUUID(), new_sales: randomUUID() };
const previous = new Map<PilotSwitchKey, unknown>();
const touched = new Set<PilotSwitchKey>();

async function setSwitch(key: PilotSwitchKey, enabled: boolean) {
  await sqlClient`
    insert into tenant_settings (id, tenant_id, category, key, value)
    values (${settingIds[key]}, 'tenant_ks', 'pilot', ${key},
      ${JSON.stringify({ enabled, revision: 1 })}::jsonb)
    on conflict (tenant_id, category, key) do update set value = excluded.value
  `;
  touched.add(key);
}

function useAuth(auth = pilotAuth()) {
  wiring.handler.mockImplementation(auth.handler);
  wiring.getSession.mockImplementation(auth.api.getSession);
  wiring.revokeSession.mockImplementation(auth.api.revokeSession);
  return auth;
}

function confirm(userId: string) {
  return resolveTenantClassificationCore({
    session,
    authority,
    userId,
    currentTenantId: 'tenant_ks',
  });
}

describe.runIf(process.env.REQUIRE_PILOT_IDENTITY_CONTRACT === '1')(
  'Pilot identity closures on isolated local Postgres',
  () => {
    beforeAll(async () => {
      // The app opens the configured admin and RLS pools. The pinned library gets its own
      // connection to the same local database through the existing OTP contract harness.
      if (
        readDisposableTargetClass(process.env) !== 'local' ||
        (process.env.BETTER_AUTH_CONTRACT_DATABASE_URL &&
          process.env.BETTER_AUTH_CONTRACT_DATABASE_URL !== process.env.DATABASE_URL)
      ) {
        throw new Error(
          'Pilot identity contract requires matching isolated local database targets'
        );
      }
      vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
      const [library] = await sqlClient<{ pid: number }[]>`select pg_backend_pid() as pid`;
      const [classification] = await withTenantAuthority(authority, tx =>
        tx.execute<{ pid: number; restricted: boolean }>(sql`
          select pg_backend_pid() as pid, not rolsuper and not rolbypassrls as restricted
          from pg_roles where rolname = current_user
        `)
      );
      expect(classification?.restricted).toBe(true);
      expect(classification?.pid).not.toBe(library?.pid);
      const stored = await sqlClient<{ key: PilotSwitchKey; value: unknown }[]>`
        select key, value from tenant_settings where tenant_id = 'tenant_ks' and category = 'pilot'
          and key in ('public_intake', 'new_sales')
      `;
      for (const row of stored) previous.set(row.key, row.value);
    });

    beforeEach(async () => {
      vi.clearAllMocks();
      wiring.after.length = 0;
      await setSwitch('public_intake', false);
      useAuth();
    });

    afterEach(cleanupContractRows);
    afterAll(async () => {
      try {
        for (const key of touched) {
          if (previous.has(key)) {
            await sqlClient`
              update tenant_settings set value = ${JSON.stringify(previous.get(key))}::jsonb
              where tenant_id = 'tenant_ks' and category = 'pilot' and key = ${key}
            `;
          } else {
            await sqlClient`delete from tenant_settings where id = ${settingIds[key]}`;
          }
        }
      } finally {
        vi.unstubAllEnvs();
        await sqlClient.end();
      }
    });

    it('refuses password sign-up independently at the closed library and the closed runtime route', async () => {
      const email = uniqueEmail('pilot-password-signup');
      await setSwitch('public_intake', true);
      const libraryClosed = await POST(signUpRequest(email));
      expect(wiring.handler).toHaveBeenCalledTimes(1);
      expect(libraryClosed.status).toBe(400);
      expect(await libraryClosed.json()).toMatchObject({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' });
      expect(await userCount(email)).toHaveLength(0);

      const openLibrary = useAuth(pilotAuth({ open: true }));
      await setSwitch('public_intake', false);
      wiring.handler.mockClear();
      const routeClosed = await POST(signUpRequest(email));
      expect(routeClosed.status).toBe(401);
      expect(await routeClosed.json()).toMatchObject({ code: 'WRONG_TENANT_CONTEXT' });
      expect(wiring.handler).not.toHaveBeenCalled();

      await setSwitch('public_intake', true);
      wiring.handler.mockImplementationOnce(async (request: Request) => {
        await setSwitch('public_intake', false);
        return openLibrary.handler(request);
      });
      const hookClosed = await POST(signUpRequest(email));
      expect(wiring.handler).toHaveBeenCalledTimes(1);
      expect(await hookClosed.json()).toMatchObject({ code: 'INVALID_ONBOARDING_CONTEXT' });
      expect(await userCount(email)).toHaveLength(0);
    });

    it('keeps unknown code send and valid pre-existing code verify generic through both independent layers', async () => {
      const known = uniqueEmail('pilot-pending-known');
      await insertDoorAccount(known);
      const unknown = uniqueEmail('pilot-unknown');
      const allowed = await POST(sendRequest(known));
      expect(wiring.handler).toHaveBeenCalledTimes(1);
      const generic = await POST(sendRequest(unknown));
      expect(generic.status).toBe(allowed.status);
      expect(await generic.json()).toEqual(await allowed.json());
      expect(wiring.handler).toHaveBeenCalledTimes(1);
      expect(await challenges(unknown)).toHaveLength(0);

      const fixture = contractAuth();
      await send(fixture, unknown);
      expect(await challenges(unknown)).toHaveLength(1);
      useAuth(pilotAuth({ open: true }));
      wiring.handler.mockClear();
      const routeClosed = await POST(verifyRequest(unknown));
      expect(await routeClosed.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(wiring.handler).not.toHaveBeenCalled();

      await setSwitch('public_intake', true);
      useAuth();
      const libraryClosed = await POST(verifyRequest(unknown));
      expect(libraryClosed.status).toBe(routeClosed.status);
      expect(await libraryClosed.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(wiring.handler).toHaveBeenCalledTimes(1);
      expect(await userCount(unknown)).toHaveLength(0);

      wiring.after.length = 0;
      const sendViaLibrary = await POST(sendRequest(unknown));
      expect(sendViaLibrary.status).toBe(200);
      expect(await sendViaLibrary.json()).toEqual({ success: true });
      expect(wiring.after).toHaveLength(0);
      expect(wiring.sendSignInOtpEmail).not.toHaveBeenCalled();
      expect(await challenges(unknown)).toHaveLength(0);
    });

    it.each([
      { tenant: 'tenant_mk', pending: true },
      { tenant: 'tenant_ks', pending: false },
    ])(
      'leaves an ineligible account, credential and sessions intact ($tenant / $pending)',
      async state => {
        const email = uniqueEmail('pilot-ineligible');
        const id = await insertDoorAccount(email, state);
        const before = await readDoorAccount(id);
        expect(await (await POST(sendRequest(email))).json()).toEqual({ success: true });
        expect(await challenges(email)).toHaveLength(0);
        await send(contractAuth(), email);
        const denied = await POST(verifyRequest(email));
        expect(denied.status).toBe(400);
        expect(await denied.json()).toMatchObject({ code: 'INVALID_OTP' });
        expect(wiring.handler).not.toHaveBeenCalled();
        expect(await readDoorAccount(id)).toEqual(before);
      }
    );

    it('rejects confirmation between the door precheck and an unproven account’s mailbox proof', async () => {
      const email = uniqueEmail('pilot-precheck-first');
      const id = await insertDoorAccount(email);
      await send(contractAuth(), email);
      const auth = pilotAuth();
      wiring.handler.mockImplementationOnce(async (request: Request) => {
        expect(await confirm(id)).toMatchObject({ code: 'EMAIL_NOT_PROVEN' });
        expect((await readDoorAccount(id)).owner?.pending).toBe(true);
        return auth.handler(request);
      });
      wiring.getSession.mockImplementation(auth.api.getSession);
      wiring.revokeSession.mockImplementation(auth.api.revokeSession);
      const verified = await POST(verifyRequest(email));
      expect(verified.status).toBe(200);
      const after = await readDoorAccount(id);
      expect(after.owner).toMatchObject({ verified: true, pending: true });
      expect(after.credentials).toHaveLength(0);
      expect(after.sessions).toHaveLength(1);
    });

    it('rejects a door verify after confirmation of a proven account and preserves its access', async () => {
      const email = uniqueEmail('pilot-confirm-first');
      const id = await insertDoorAccount(email, { verified: true });
      await send(contractAuth(), email);
      expect(await confirm(id)).toMatchObject({ success: true });
      const before = await readDoorAccount(id);
      expect(before.owner?.pending).toBe(false);
      const denied = await POST(verifyRequest(email));
      expect(denied.status).toBe(400);
      expect(await denied.json()).toMatchObject({ code: 'INVALID_OTP' });
      expect(wiring.handler).not.toHaveBeenCalled();
      expect(await readDoorAccount(id)).toEqual(before);
    });

    it('returns EMAIL_NOT_PROVEN and keeps an unverified account pending', async () => {
      const email = uniqueEmail('pilot-unproven');
      const id = await insertDoorAccount(email);
      const before = await readDoorAccount(id);
      expect(await confirm(id)).toMatchObject({ code: 'EMAIL_NOT_PROVEN' });
      expect(await readDoorAccount(id)).toEqual(before);
    });

    it('L-4 bounds the pre-existing reset and door verification race and allows recovery by a new reset', async () => {
      await setSwitch('new_sales', false);
      const email = uniqueEmail('pilot-l4');
      const id = await insertDoorAccount(email);
      const sameTenant = await insertDoorAccount(uniqueEmail('pilot-other-account'));
      const unrelated = await insertDoorAccount(uniqueEmail('pilot-other-tenant'), {
        tenant: 'tenant_mk',
      });
      const sameTenantBefore = await readDoorAccount(sameTenant);
      const unrelatedBefore = await readDoorAccount(unrelated);
      await send(contractAuth(), email);

      const read = defer();
      const resume = defer();
      useAuth(
        pilotAuth({
          afterUserRead: async userId => {
            if (userId !== id) return;
            read.resolve();
            await resume.promise;
          },
        })
      );

      const resetAuth = pilotAuth();
      async function resetByMail() {
        wiring.sendPasswordResetEmail.mockClear();
        expect(
          (await resetAuth.handler(doorRequest('request-password-reset', { email }))).status
        ).toBe(200);
        const url = wiring.sendPasswordResetEmail.mock.calls[0]?.[1];
        if (!url) throw new Error('Reset mail did not contain a link');
        const token = new URL(url).pathname.split('/').at(-1);
        expect(
          (
            await resetAuth.handler(
              doorRequest('reset-password', { token, newPassword: replacementPassword })
            )
          ).status
        ).toBe(200);
      }

      const verifying = POST(verifyRequest(email));
      try {
        await Promise.race([
          read.promise,
          verifying.then(() => {
            throw new Error('Door verification completed before the L-4 pause');
          }),
        ]);
        await resetByMail();
        expect(await confirm(id)).toMatchObject({ success: true });
      } finally {
        resume.resolve();
      }

      // L-4 only pins containment and recovery. The credential outcome is free to improve.
      const stopped = await verifying;
      expect(stopped.status).toBe(409);
      expect(await stopped.json()).toMatchObject({ code: 'ACCOUNT_STOP' });
      expect(stopped.headers.getSetCookie()).not.toEqual(
        expect.arrayContaining([expect.stringContaining('session_token')])
      );
      expect((await readDoorAccount(id)).sessions).toHaveLength(0);
      expect(await readDoorAccount(sameTenant)).toEqual(sameTenantBefore);
      expect(await readDoorAccount(unrelated)).toEqual(unrelatedBefore);
      await resetByMail();
      expect(
        (
          await resetAuth.handler(
            doorRequest('sign-in/email', { email, password: replacementPassword })
          )
        ).status
      ).toBe(200);
    }, 15_000);
  }
);
