import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mail: vi.fn() }));
vi.mock('../email', () => ({
  normalizeSignInOtpLocale: vi.fn(() => 'en'),
  sendPasswordResetEmail: mocks.mail,
  sendSignInOtpEmail: vi.fn(),
}));

import * as store from './different-email-recovery-store';
import {
  changeEmail,
  credentialOwner,
  gates,
  requestReset,
  resetAuth,
  resetRows,
  resetWith,
  tokenFrom,
  withDeleteFailure,
} from './different-email-recovery-reset.contract-test-support';
import {
  cleanupRecoveryRows,
  ownerSnapshot,
  recoverySql,
} from './different-email-recovery-store.contract-test-support';
import { cleanupResetRows } from './different-email-recovery-reset.contract-test-support';

const GENERIC = {
  status: true,
  message: 'If this email exists in our system, check your email for the reset link',
};

function mailedToken(call = 0) {
  return tokenFrom(String(mocks.mail.mock.calls[call]?.[1]));
}

async function expectRefused(response: Response) {
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'INVALID_TOKEN' });
}

afterEach(async () => {
  mocks.mail.mockReset();
  await cleanupResetRows();
  await cleanupRecoveryRows();
});
afterAll(async () => recoverySql.end());

describe.runIf(process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT === '1')(
  'ACQ-2c reset links and the dual-proof email change (real PostgreSQL)',
  () => {
    it('a committed change withdraws every reset link of that user and nothing else', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('withdraw');
      const other = await credentialOwner('bystander');
      for (const email of [owner.email, owner.email, other.email]) {
        expect(await (await requestReset(auth, email)).json()).toEqual(GENERIC);
      }
      const [first, second, bystander] = [mailedToken(0), mailedToken(1), mailedToken(2)];
      const purpose = `email-verification-otp-${owner.email}`;
      // prettier-ignore
      await recoverySql`insert into "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") values (${randomUUID()}, ${purpose}, ${owner.id}, now() + interval '5 minutes', now(), now())`;

      expect(await changeEmail(owner.id, owner.email, `moved-${owner.email}`)).toBe(true);

      expect(await resetRows(owner.id)).toEqual([]);
      expect(await resetRows(other.id)).toHaveLength(1);
      // prettier-ignore
      expect(await recoverySql`select 1 from "verification" where "identifier" = ${purpose}`).toHaveLength(1);
      await expectRefused(await resetWith(auth, first));
      await expectRefused(await resetWith(auth, second));
      expect((await resetWith(auth, bystander)).status).toBe(200);
    });

    it('a failed token cleanup rolls the email change back with the tokens', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('rollback');
      await requestReset(auth, owner.email);
      const token = mailedToken();

      const changed = await withDeleteFailure('verification', owner.id, () =>
        changeEmail(owner.id, owner.email, `moved-${owner.email}`)
      );

      expect(changed).toBe(false);
      expect(await ownerSnapshot(owner.id)).toMatchObject({ email: owner.email });
      expect(await resetRows(owner.id)).toEqual([`reset-password:${token}`]);
      expect((await resetWith(auth, token)).status).toBe(200);
    });

    it('a change between user lookup and token storage leaves no usable link', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('lookup-race');
      let stored = '';
      gates.beforeToken = async identifier => {
        gates.beforeToken = undefined;
        stored = identifier.slice('reset-password:'.length);
        expect(await changeEmail(owner.id, owner.email, `moved-${owner.email}`)).toBe(true);
      };

      expect(await (await requestReset(auth, owner.email)).json()).toEqual(GENERIC);

      expect(stored).not.toBe('');
      expect(mocks.mail).not.toHaveBeenCalled();
      expect(await resetRows(owner.id)).toEqual([]);
      await expectRefused(await resetWith(auth, stored));
    });

    it('a change after the mail check but before delivery kills the delivered link', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('delivery-race');
      mocks.mail.mockImplementationOnce(async () => {
        expect(await changeEmail(owner.id, owner.email, `moved-${owner.email}`)).toBe(true);
      });

      expect(await (await requestReset(auth, owner.email)).json()).toEqual(GENERIC);

      expect(mocks.mail).toHaveBeenCalledWith(owner.email, expect.any(String));
      expect(await resetRows(owner.id)).toEqual([]);
      await expectRefused(await resetWith(auth, mailedToken()));
    });

    it('keeps the generic response when delivery fails or the address is unknown', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('generic');
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mocks.mail.mockRejectedValueOnce(new Error('SYNTHETIC_DELIVERY_FAILURE'));

      expect(await (await requestReset(auth, owner.email)).json()).toEqual(GENERIC);
      expect(await (await requestReset(auth, `nobody-${owner.email}`)).json()).toEqual(GENERIC);

      const logged = JSON.stringify(log.mock.calls);
      expect(logged).not.toContain(owner.email);
      expect(logged).not.toMatch(/reset-password\/[A-Za-z0-9]/u);
    });

    it('releases mail only for the current, canonical-equivalent mailbox of a known user', async () => {
      const owner = await credentialOwner('release');
      const token = randomUUID();
      // prettier-ignore
      await recoverySql`insert into "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") values (${randomUUID()}, ${'reset-password:' + token}, ${owner.id}, now() + interval '1 hour', now(), now())`;

      const upper = ` ${owner.email.toUpperCase()} `;
      expect(await store.releaseResetMailIfCurrent(owner.id, token, upper)).toBe(true);
      expect(await resetRows(owner.id)).toHaveLength(1);
      expect(await store.releaseResetMailIfCurrent(randomUUID(), token, owner.email)).toBe(false);
      expect(await resetRows(owner.id)).toHaveLength(1);
      expect(await store.releaseResetMailIfCurrent(owner.id, token, `old-${owner.email}`)).toBe(
        false
      );
      expect(await resetRows(owner.id)).toEqual([]);
    });
  }
);
