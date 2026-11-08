import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mail: vi.fn() }));
vi.mock('../email', () => ({
  normalizeSignInOtpLocale: vi.fn(() => 'en'),
  sendPasswordResetEmail: mocks.mail,
  sendSignInOtpEmail: vi.fn(),
}));

import * as store from './different-email-recovery-store';
import {
  captureConsole,
  changeEmail,
  cleanEachResetContract,
  describeResetContract,
  credentialOwner,
  gates,
  requestReset,
  resetAuth,
  resetRows,
  resetWith,
  tokenFrom,
  withWriteFailure,
} from './different-email-recovery-reset.contract-test-support';
import { ownerSnapshot, recoverySql } from './different-email-recovery-store.contract-test-support';

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

cleanEachResetContract(mocks.mail);

describeResetContract(
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

      const changed = await withWriteFailure('reset-token', owner.id, () =>
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

    it('withholds a stale link and logs nothing sensitive when its withdrawal fails', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('privacy');
      const moved = `moved-${owner.email}`;
      let stored = '';
      gates.beforeToken = async identifier => {
        gates.beforeToken = undefined;
        stored = identifier.slice('reset-password:'.length);
        expect(await changeEmail(owner.id, owner.email, moved)).toBe(true);
      };
      const lines = captureConsole();

      const response = await withWriteFailure('reset-token', owner.id, () =>
        requestReset(auth, owner.email)
      );

      expect(await response.json()).toEqual(GENERIC);
      expect(mocks.mail).not.toHaveBeenCalled();
      // The failed withdrawal rolled back, so the never-mailed token row remains until it expires.
      expect(await resetRows(owner.id)).toEqual([`reset-password:${stored}`]);
      const rendered = lines.join('\n');
      expect(rendered).toContain('reset_store_unavailable');
      for (const secret of [stored, owner.id, owner.email, moved, 'ACQ2C_FORCED_WRITE_FAILURE']) {
        expect(rendered).not.toContain(secret);
      }
    });

    it('keeps the generic response when delivery fails or the address is unknown', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('generic');
      captureConsole();
      mocks.mail.mockRejectedValueOnce(new Error('SYNTHETIC_DELIVERY_FAILURE'));

      expect(await (await requestReset(auth, owner.email)).json()).toEqual(GENERIC);
      expect(await (await requestReset(auth, `nobody-${owner.email}`)).json()).toEqual(GENERIC);
      expect(mocks.mail).toHaveBeenCalledTimes(1);
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
