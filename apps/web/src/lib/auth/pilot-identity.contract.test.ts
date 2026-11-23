import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contractAuth, send, uniqueEmail } from './better-auth-email-otp.contract-test-support';
import {
  activateCurrentProof,
  activateReplacementProof,
  confirmReplacementProof,
  discardProof,
  reserveCurrentProof,
  reserveReplacementProof,
} from './different-email-recovery-store';
import {
  installIdentityContractHooks,
  setSwitch,
  useAuth,
  wiring,
} from './pilot-identity-closures.test-support';
import { POST } from '@/app/api/auth/[...all]/route';
import {
  challenges,
  insertDoorAccount,
  pilotAuth,
  readDoorAccount,
  sendRequest,
  signUpRequest,
  userCount,
  verifyRequest,
} from './pilot-identity.contract-test-support';

describe.runIf(process.env.REQUIRE_PILOT_IDENTITY_CONTRACT === '1')(
  'Pilot identity closures on isolated local Postgres',
  () => {
    installIdentityContractHooks();

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

    it('keeps unknown send generic and refuses absent-account verify with intake closed or open', async () => {
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
      const issued = await challenges(unknown);
      expect(issued).toHaveLength(1);
      useAuth(pilotAuth({ open: true }));
      wiring.handler.mockClear();
      const routeClosed = await POST(verifyRequest(unknown));
      expect(await routeClosed.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(wiring.handler).not.toHaveBeenCalled();

      await setSwitch('public_intake', true);
      const routeOpen = await POST(verifyRequest(unknown));
      expect(routeOpen.status).toBe(routeClosed.status);
      expect(await routeOpen.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(routeOpen.headers.get('set-cookie')).toBeNull();
      expect(wiring.handler).not.toHaveBeenCalled();
      expect(await challenges(unknown)).toEqual(issued);
      expect(await userCount(unknown)).toHaveLength(0);

      useAuth();
      wiring.after.length = 0;
      const sendViaLibrary = await POST(sendRequest(unknown));
      expect(sendViaLibrary.status).toBe(200);
      expect(await sendViaLibrary.json()).toEqual({ success: true });
      expect(wiring.handler).toHaveBeenCalledOnce();
      expect(wiring.after).toHaveLength(0);
      expect(wiring.sendSignInOtpEmail).not.toHaveBeenCalled();
      expect(await challenges(unknown)).toHaveLength(0);
    });

    it('invalidates sign-in codes for both mailboxes when an account replaces its email', async () => {
      const oldEmail = uniqueEmail('pilot-replaced-old');
      const newEmail = uniqueEmail('pilot-replaced-new');
      const id = await insertDoorAccount(oldEmail, { verified: true });
      const fixture = contractAuth();
      const checkOldCode = () =>
        fixture.api.checkVerificationOTP({
          body: { email: oldEmail, otp: '123456', type: 'sign-in' },
        });
      expect((await send(fixture, oldEmail)).status).toBe(200);
      expect((await send(fixture, newEmail)).status).toBe(200);
      await expect(checkOldCode()).resolves.toEqual({ success: true });
      expect(await challenges(oldEmail)).toHaveLength(1);
      expect(await challenges(newEmail)).toHaveLength(1);

      const current = randomUUID();
      const replacement = randomUUID();
      const now = new Date();
      try {
        expect(
          await reserveCurrentProof({
            currentEmail: oldEmail,
            digest: 'current',
            nonce: current,
            now,
            userId: id,
          })
        ).toEqual({ ok: true });
        expect(await activateCurrentProof(id, current, oldEmail, now)).toBe(true);
        expect(
          await reserveReplacementProof({
            currentDigest: 'current',
            newEmail,
            nonce: replacement,
            now,
            replacementDigest: 'replacement',
            userId: id,
          })
        ).toEqual({ ok: true });
        expect(await activateReplacementProof(id, replacement, now)).toBe(true);
        expect(await confirmReplacementProof(id, () => 'replacement', now)).toEqual({ ok: true });
        expect(await userCount(oldEmail)).toEqual([]);
        expect(await userCount(newEmail)).toEqual([{ id }]);
        await expect(checkOldCode()).rejects.toMatchObject({ body: { code: 'INVALID_OTP' } });
        expect(await challenges(oldEmail)).toHaveLength(0);
        expect(await challenges(newEmail)).toHaveLength(0);
      } finally {
        await discardProof(id, 'current', current);
        await discardProof(id, 'replacement', replacement);
      }
    });

    it.each([
      { tenant: 'tenant_mk', pending: true, verified: true },
      { tenant: 'tenant_ks', pending: false, verified: true },
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
  }
);
