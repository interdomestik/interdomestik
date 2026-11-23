import { describe, expect, it } from 'vitest';
import { contractAuth, send, uniqueEmail } from './better-auth-email-otp.contract-test-support';
import {
  confirm,
  installIdentityContractHooks,
  setSwitch,
  useAuth,
  wiring,
} from './pilot-identity-closures.test-support';
import { POST } from '@/app/api/auth/[...all]/route';
import {
  defer,
  doorRequest,
  insertDoorAccount,
  pilotAuth,
  readDoorAccount,
  replacementPassword,
  verifyRequest,
} from './pilot-identity.contract-test-support';

describe.runIf(process.env.REQUIRE_PILOT_IDENTITY_CONTRACT === '1')(
  'Pilot identity closures on isolated local Postgres',
  () => {
    installIdentityContractHooks();

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
