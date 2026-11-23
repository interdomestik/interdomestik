import { describe, expect, it } from 'vitest';
import {
  contractAuth,
  send,
  sqlClient,
  uniqueEmail,
} from './better-auth-email-otp.contract-test-support';
import {
  confirm,
  installIdentityContractHooks,
  setSwitch,
  useAuth,
  waitForBlockedQuery,
  withPendingRecovery,
  wiring,
} from './pilot-identity-closures.test-support';
import { POST } from '@/app/api/auth/[...all]/route';
import {
  challenges,
  defer,
  doorRequest,
  insertDoorAccount,
  pilotAuth,
  readDoorAccount,
  replacementPassword,
  userCount,
  verifyRequest,
} from './pilot-identity.contract-test-support';

describe.runIf(process.env.REQUIRE_PILOT_IDENTITY_CONTRACT === '1')(
  'Pilot identity closures on isolated local Postgres',
  () => {
    installIdentityContractHooks();

    it('refuses the replacement when the intake close commits first', async () => {
      await withPendingRecovery(async ({ close, recover, email, replacement, id }) => {
        const locked = defer();
        const release = defer();
        let closerPid = 0;
        const closing = close(
          pid => {
            closerPid = pid;
          },
          async () => {
            locked.resolve();
            await release.promise;
          }
        );
        let recovery: ReturnType<typeof recover> | undefined;
        try {
          await Promise.race([locked.promise, closing]);
          recovery = recover();
          await waitForBlockedQuery(sqlClient, closerPid, 'for share');
        } finally {
          release.resolve();
          await Promise.allSettled([closing, recovery]);
        }
        await closing;
        expect(await recovery).toEqual({ ok: false, code: 'CLOSED' });
        expect(await userCount(email)).toEqual([{ id }]);
        expect(await userCount(replacement)).toEqual([]);
      });
    }, 15_000);

    it('makes the close wait for a replacement that locked intake first', async () => {
      await withPendingRecovery(async ({ close, recover, email, replacement, id }) => {
        let recovery: ReturnType<typeof recover> | undefined;
        let closing: ReturnType<typeof close> | undefined;
        try {
          // The observer holds the user's row to pause recovery at its update, after FOR SHARE.
          await sqlClient.begin(async observer => {
            const [backend] = await observer<{ pid: number }[]>`select pg_backend_pid() as pid`;
            await observer`select id from "user" where id = ${id} for no key update`;
            recovery = recover();
            const recoveryPid = await waitForBlockedQuery(observer, backend!.pid, 'update "user"');
            closing = close();
            await waitForBlockedQuery(observer, recoveryPid, 'for update');
            expect(await observer`select email from "user" where id = ${id}`).toEqual([{ email }]);
          });
        } finally {
          await Promise.allSettled([recovery, closing]);
        }
        expect(await recovery).toEqual({ ok: true });
        await closing;
        expect(await userCount(email)).toEqual([]);
        expect(await userCount(replacement)).toEqual([{ id }]);
      });
    }, 15_000);

    it('refuses a valid OTP for an unverified account before Better Auth and preserves its access', async () => {
      const email = uniqueEmail('pilot-precheck-first');
      const id = await insertDoorAccount(email);
      expect((await send(contractAuth(), email)).status).toBe(200);
      expect(await challenges(email)).toHaveLength(1);
      const before = await readDoorAccount(id);
      expect(before.owner).toMatchObject({ verified: false, pending: true });
      expect(before.credentials).toHaveLength(1);
      expect(before.sessions).toHaveLength(1);

      const denied = await POST(verifyRequest(email));

      expect(denied.status).toBe(400);
      expect(await denied.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(denied.headers.get('set-cookie')).toBeNull();
      expect(wiring.handler).not.toHaveBeenCalled();
      expect(await readDoorAccount(id)).toEqual(before);
    });

    it('verifies a pending account with a proven mailbox and preserves its prior access', async () => {
      const email = uniqueEmail('pilot-verified-pending');
      const id = await insertDoorAccount(email, { verified: true });
      await send(contractAuth(), email);
      const before = await readDoorAccount(id);

      const verified = await POST(verifyRequest(email));

      expect(verified.status).toBe(200);
      expect(verified.headers.get('set-cookie')).toContain('session_token');
      const after = await readDoorAccount(id);
      expect(after.owner).toEqual(before.owner);
      expect(after.credentials).toEqual(before.credentials);
      expect(after.sessions).toEqual(expect.arrayContaining([...before.sessions]));
      expect(after.sessions).toHaveLength(before.sessions.length + 1);
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
      const id = await insertDoorAccount(email, { verified: true });
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
          afterEmailRead: async readEmail => {
            if (readEmail !== email) return;
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
