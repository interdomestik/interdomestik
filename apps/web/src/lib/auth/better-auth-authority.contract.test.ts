import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContractRows,
  contractAuth,
  cookieHeaderFrom,
  insertRegisteredUser,
  send,
  signUp,
  sqlClient,
  uniqueEmail,
  updateUser,
  verify,
} from './better-auth-email-otp.contract-test-support';

interface AuthorityRow {
  id: string;
  name: string;
  role: string;
  tenantId: string;
  branchId: string | null;
  memberNumber: string | null;
  pending: boolean;
  agentId: string | null;
  referralCode: string | null;
}

function authorityRows(email: string) {
  return sqlClient<AuthorityRow[]>`
    select "id", "name", "role", "tenant_id" as "tenantId", "branch_id" as "branchId",
      "member_number" as "memberNumber", "tenant_classification_pending" as "pending",
      "agentId", "referral_code" as "referralCode"
    from "user" where "email" = ${email}
  `;
}

afterEach(cleanupContractRows);
afterAll(async () => sqlClient.end());

describe.runIf(process.env.REQUIRE_BETTER_AUTH_AUTHORITY_CONTRACT === '1')(
  'Better Auth authority contract on isolated local Postgres',
  () => {
    it('C02/C04/C12 persists only canonical create authority and denies atomic update', async () => {
      const auth = contractAuth();
      const email = uniqueEmail('authority');
      const created = await signUp(auth, {
        email,
        password: 'Password123!',
        name: 'Canonical',
        onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
        role: 'super_admin',
        tenantId: 'tenant_mk',
        branchId: 'mk_branch_a',
        memberNumber: 'ATTACKER',
        tenantClassificationPending: false,
        agentId: 'agent-attacker',
        referralCode: 'OWNED',
      });
      expect(created.status, await created.clone().text()).toBe(200);
      const cookie = cookieHeaderFrom(created);
      const rows = await authorityRows(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: 'Canonical',
        role: 'member',
        tenantId: 'tenant_ks',
        branchId: null,
        pending: true,
        agentId: null,
        referralCode: null,
      });
      expect(rows[0]?.memberNumber).not.toBe('ATTACKER');
      const before = { ...rows[0] };

      const denied = await updateUser(auth, { name: 'Poisoned', role: 'super_admin' }, cookie);
      expect(denied.status).toBe(400);
      expect(await denied.json()).toMatchObject({ code: 'AUTHORITY_FIELD_NOT_WRITABLE' });
      expect(denied.headers.getSetCookie().some(value => value.includes('session_token'))).toBe(
        false
      );
      const after = await authorityRows(email);
      expect(after[0]).toEqual(before);
      const fresh = await auth.api.getSession({
        headers: new Headers({ cookie }),
        query: { disableCookieCache: true, disableRefresh: true },
      });
      expect(fresh?.user).toMatchObject({ role: 'member', tenantId: 'tenant_ks' });
    });

    it('C07 creates an OTP user canonically and preserves existing-user sign-in', async () => {
      const auth = contractAuth();
      const newEmail = uniqueEmail('otp-new');
      await send(auth, newEmail);
      const created = await verify(auth, newEmail, '123456');
      expect(created.status).toBe(200);
      const newRows = await sqlClient<
        { role: string; tenantId: string; branchId: string | null; pending: boolean }[]
      >`
        select "role", "tenant_id" as "tenantId", "branch_id" as "branchId",
          "tenant_classification_pending" as "pending"
        from "user" where "email" = ${newEmail}
      `;
      expect(newRows).toEqual([
        { role: 'member', tenantId: 'tenant_ks', branchId: null, pending: true },
      ]);

      const existingEmail = uniqueEmail('otp-existing');
      await insertRegisteredUser(existingEmail);
      await send(auth, existingEmail);
      const signedIn = await verify(auth, existingEmail, '123456', false);
      expect(signedIn.status).toBe(200);
      const existingRows = await sqlClient<{ role: string; tenantId: string }[]>`
        select "role", "tenant_id" as "tenantId" from "user" where "email" = ${existingEmail}
      `;
      expect(existingRows).toEqual([{ role: 'member', tenantId: 'tenant_ks' }]);
    });
  }
);
