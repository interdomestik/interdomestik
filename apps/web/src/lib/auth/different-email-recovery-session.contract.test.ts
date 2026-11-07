import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mail: vi.fn() }));
vi.mock('../email', () => ({
  normalizeSignInOtpLocale: vi.fn(() => 'en'),
  sendPasswordResetEmail: mocks.mail,
  sendSignInOtpEmail: vi.fn(),
}));

import {
  captureConsole,
  changeEmail,
  cleanupResetRows,
  credentialOwner,
  emailVerified,
  gates,
  NEW_PASSWORD,
  PASSWORD,
  requestReset,
  resetAuth,
  resetWith,
  sessionUser,
  signIn,
  tokenFrom,
  withWriteFailure,
} from './different-email-recovery-reset.contract-test-support';
import {
  cleanupRecoveryRows,
  ownerSnapshot,
  recoverySql,
} from './different-email-recovery-store.contract-test-support';

async function mailedToken(auth: ReturnType<typeof resetAuth>, email: string) {
  mocks.mail.mockClear();
  await requestReset(auth, email);
  return tokenFrom(String(mocks.mail.mock.calls[0]?.[1]));
}

async function signedIn(auth: ReturnType<typeof resetAuth>, email: string, password = PASSWORD) {
  const cookie = await signIn(auth, email, password);
  expect(cookie, `sign-in for ${email}`).toBeTruthy();
  return cookie!;
}

afterEach(async () => {
  vi.restoreAllMocks();
  mocks.mail.mockReset();
  await cleanupResetRows();
  await cleanupRecoveryRows();
});
afterAll(async () => recoverySql.end());

describe.runIf(process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT === '1')(
  'ACQ-2c password reset and sessions (real PostgreSQL)',
  () => {
    it('a reset ends every session of that user only, once, within its lifetime', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('sessions');
      const other = await credentialOwner('other-sessions');
      // prettier-ignore
      await recoverySql`update "user" set "role" = 'member', "member_number" = ${'IDA-' + owner.id} where "id" = ${owner.id}`;
      const [first, second] = [
        await signedIn(auth, owner.email),
        await signedIn(auth, owner.email),
      ];
      const bystander = await signedIn(auth, other.email);
      const token = await mailedToken(auth, owner.email);

      expect((await resetWith(auth, token)).status).toBe(200);

      // The app keeps no session cookie cache, so revocation is immediate on the next request.
      expect(await sessionUser(auth, first)).toBeNull();
      expect(await sessionUser(auth, second)).toBeNull();
      expect(await sessionUser(auth, bystander)).toBe(other.id);
      expect((await resetWith(auth, token, `${NEW_PASSWORD}-replay`)).status).toBe(400);
      expect(await signIn(auth, owner.email, PASSWORD)).toBeNull();
      expect(await sessionUser(auth, await signedIn(auth, owner.email, NEW_PASSWORD))).toBe(
        owner.id
      );
      // prettier-ignore
      const [identity] = await recoverySql<{ member_number: string; role: string }[]>`select "member_number", "role" from "user" where "id" = ${owner.id}`;
      expect(identity).toEqual({ member_number: `IDA-${owner.id}`, role: 'member' });

      const expired = await mailedToken(auth, owner.email);
      // prettier-ignore
      await recoverySql`update "verification" set "expiresAt" = now() - interval '1 minute' where "identifier" = ${'reset-password:' + expired}`;
      expect((await resetWith(auth, expired, `${NEW_PASSWORD}-late`)).status).toBe(400);
    });

    it('a first password created from the link signs in as the same account', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('first-password', false);
      await recoverySql`update "user" set "emailVerified" = false where "id" = ${owner.id}`;

      expect((await resetWith(auth, await mailedToken(auth, owner.email))).status).toBe(200);

      // prettier-ignore
      const accounts = await recoverySql`select "providerId", "accountId" from "account" where "userId" = ${owner.id}`;
      expect(accounts).toEqual([{ providerId: 'credential', accountId: owner.id }]);
      // Following the link proved the mailbox it was mailed to (ACQ-2b2 activation).
      expect(await emailVerified(owner.id)).toBe(true);
      expect(await sessionUser(auth, await signedIn(auth, owner.email, NEW_PASSWORD))).toBe(
        owner.id
      );
    });

    it('consume wins: a token consumed before an email change commits still completes', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('consume-wins');
      const before = await signedIn(auth, owner.email);
      const token = await mailedToken(auth, owner.email);
      const moved = `moved-${owner.email}`;
      gates.beforeHash = async () => {
        gates.beforeHash = undefined;
        expect(await changeEmail(owner.id, owner.email, moved)).toBe(true);
      };

      expect((await resetWith(auth, token)).status).toBe(200);

      expect(await ownerSnapshot(owner.id)).toMatchObject({ email: moved, id: owner.id });
      expect(await sessionUser(auth, before)).toBeNull();
      expect(await signIn(auth, moved, PASSWORD)).toBeNull();
      expect(await sessionUser(auth, await signedIn(auth, moved, NEW_PASSWORD))).toBe(owner.id);
      // The new mailbox gets fresh links; nothing issued for the old one remains usable.
      expect(await signIn(auth, owner.email, NEW_PASSWORD)).toBeNull();
    });

    it('verifies only the exact address the completed link was mailed to', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('stale-mailbox');
      await recoverySql`update "user" set "emailVerified" = false where "id" = ${owner.id}`;
      const token = await mailedToken(auth, owner.email);
      const elsewhere = `elsewhere-${owner.email}`;
      gates.beforeHash = async () => {
        gates.beforeHash = undefined;
        await recoverySql`update "user" set "email" = ${elsewhere} where "id" = ${owner.id}`;
      };

      expect((await resetWith(auth, token)).status).toBe(200);

      expect(await emailVerified(owner.id)).toBe(false);
      // A replayed or expired link completes nothing and verifies nothing.
      expect((await resetWith(auth, token, `${NEW_PASSWORD}-replay`)).status).toBe(400);
      expect(await emailVerified(owner.id)).toBe(false);
    });

    it('a failed mailbox verification never undoes the completed reset', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('verify-failure');
      await recoverySql`update "user" set "emailVerified" = false where "id" = ${owner.id}`;
      const before = await signedIn(auth, owner.email);
      const token = await mailedToken(auth, owner.email);
      const lines = captureConsole();

      const response = await withWriteFailure('user-update', owner.id, () =>
        resetWith(auth, token)
      );

      expect(response.status).toBe(200);
      expect(await sessionUser(auth, before)).toBeNull();
      expect(await emailVerified(owner.id)).toBe(false);
      const rendered = lines.join('\n');
      expect(rendered).toContain('mailbox_verification_failed');
      for (const secret of [token, owner.id, owner.email]) expect(rendered).not.toContain(secret);
      expect(await sessionUser(auth, await signedIn(auth, owner.email, NEW_PASSWORD))).toBe(
        owner.id
      );
    });

    it('a failed session revocation never reports a successful reset', async () => {
      const auth = resetAuth();
      const owner = await credentialOwner('revocation-failure');
      const before = await signedIn(auth, owner.email);
      const token = await mailedToken(auth, owner.email);
      captureConsole();

      const response = await withWriteFailure('session', owner.id, () => resetWith(auth, token));

      expect(response.status).toBeGreaterThanOrEqual(500);
      // Better Auth writes the hash before revoking (no transaction): the caller sees a failure,
      // the token is spent and the member retries with "forgot password" or the new password.
      expect(await sessionUser(auth, before)).toBe(owner.id);
      expect((await resetWith(auth, token, `${NEW_PASSWORD}-retry`)).status).toBe(400);
    });
  }
);
