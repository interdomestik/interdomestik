import assert from 'node:assert/strict';
import test from 'node:test';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import type { TenantTransaction } from '../src/index';
import * as schema from '../src/schema';
import { mintTenantAuthority, type TenantAuthority } from '../src/tenant-authority';
import { role, runtimeRole } from './wp11-notification-deliveries-rls.fixture';
import {
  recipientScratchMissing,
  seedRecipient,
  tenantA,
  tenantB,
  withVerifiedRecipientDatabase,
} from './wp11-verified-recipient-rls.fixture';

const member = 'wp11-member';
const otherMember = 'wp11-foreign';
const staff = 'wp11-staff';
const noPreference = 'wp11-no-preference';
const missingMember = 'wp11-absent';
const lease = 'wp11-lease';
const principal = { userId: member, role: 'member', branchId: null, agentId: null };
const scheduled = mintTenantAuthority({ tenantId: tenantA, purpose: 'scheduled-work' });
const foreignScheduled = mintTenantAuthority({ tenantId: tenantB, purpose: 'scheduled-work' });
const session = mintTenantAuthority({ tenantId: tenantA, purpose: 'session', principal });
const missing = { ok: false, code: 'recipient_missing' };

test('verified recipient reads under the deployment-equivalent runtime login', async t => {
  const skip = recipientScratchMissing();
  if (skip) return t.skip(skip);

  await withVerifiedRecipientDatabase(2, async ({ admin, runtime, loginName }) => {
    const [
      {
        captureVerifiedRecipientInTx: capture,
        authorizeVerifiedRecipientInTx: authorize,
        savePreferredLocale,
      },
      { withTenantAuthority },
    ] = await Promise.all([
      import('../../domain-communications/src/recipient-locale'),
      import('../src/tenant-authority-context'),
    ]);
    const email = await seedRecipient(admin, tenantA, member);
    await seedRecipient(admin, tenantB, otherMember);
    await seedRecipient(admin, tenantA, staff, { roleName: 'staff' });
    await seedRecipient(admin, tenantA, noPreference, { preference: false });

    const scoped = <T>(action: (tx: TenantTransaction) => Promise<T>) =>
      withTenantAuthority(scheduled, action);
    async function snapshot() {
      const result = await scoped(tx => capture(tx, scheduled, member, lease));
      assert.ok(result.ok, JSON.stringify(result));
      return result.handle;
    }
    const prepare = (handle: Awaited<ReturnType<typeof snapshot>>) =>
      scoped(tx => authorize(tx, scheduled, member, lease, handle));

    await t.test(
      'denies absent context and proves the effective login and locale ACL',
      async () => {
        const handle = await snapshot();
        await drizzle(runtime, { schema }).transaction(async tx => {
          await tx.execute(sql.raw(`set local role ${role}`));
          const [posture] = await tx.execute(sql`
          select session_user as login, current_user as role, rolsuper, rolbypassrls,
                 current_setting('app.current_tenant_id', true) as home,
                 current_setting('app.current_access_tenant_id', true) as access,
                 has_table_privilege(current_user, 'user_locale_preferences', 'DELETE') as can_delete
          from pg_roles where rolname = current_user`);
          assert.deepEqual(posture, {
            login: loginName,
            role: runtimeRole,
            rolsuper: false,
            rolbypassrls: false,
            home: null,
            access: null,
            can_delete: false,
          });
          assert.deepEqual(await capture(tx, scheduled, member, lease), missing);
          assert.deepEqual(await authorize(tx, scheduled, member, lease, handle), missing);
        });
      }
    );

    await t.test(
      'reads the exact verified address and stored locale only in matching scope',
      async () => {
        const handle = await snapshot();
        await scoped(async tx => {
          const [posture] = await tx.execute(sql`
            select session_user as login, current_user as role, rolsuper, rolbypassrls,
                   row_security_active('public."user"'::regclass) as account_rls,
                   row_security_active('public.user_locale_preferences'::regclass) as preference_rls
            from pg_roles where rolname = current_user`);
          assert.deepEqual(posture, {
            login: loginName,
            role: runtimeRole,
            rolsuper: false,
            rolbypassrls: false,
            account_rls: true,
            preference_rls: true,
          });
          assert.deepEqual(await authorize(tx, scheduled, member, lease, handle), {
            ok: true,
            recipient: { email, locale: 'sq' },
          });
        });

        for (const [home, access] of [
          [tenantB, tenantB],
          ['', ''],
          [tenantA, ''],
          ['', tenantA],
          [tenantA, tenantB],
          [tenantB, tenantA],
        ]) {
          await scoped(async tx => {
            await tx.execute(sql`select set_config('app.current_tenant_id', ${home}, true),
            set_config('app.current_access_tenant_id', ${access}, true)`);
            assert.deepEqual(await capture(tx, scheduled, member, lease), missing);
            assert.deepEqual(await authorize(tx, scheduled, member, lease, handle), missing);
          });
        }

        const badAuthorities = [
          {} as TenantAuthority,
          session,
          mintTenantAuthority({ tenantId: tenantA, purpose: 'scheduled-work', principal }),
          mintTenantAuthority({
            tenantId: tenantA,
            accessTenantId: tenantB,
            purpose: 'scheduled-work',
          }),
          mintTenantAuthority({ tenantId: tenantA, purpose: 'scheduled-work' }, 0),
        ];
        await scoped(async tx => {
          for (const authority of badAuthorities) {
            assert.deepEqual(await capture(tx, authority, member, lease), missing);
            assert.deepEqual(await authorize(tx, authority, member, lease, handle), missing);
          }
        });

        await withTenantAuthority(foreignScheduled, async tx => {
          assert.deepEqual(await authorize(tx, foreignScheduled, otherMember, lease, handle), {
            ok: false,
            code: 'recipient_changed',
          });
        });
      }
    );

    await t.test(
      'classifies unavailable subjects before snapshot comparison in both phases',
      async () => {
        const handle = await snapshot();
        await scoped(async tx => {
          for (const subject of ['', missingMember, staff, otherMember]) {
            assert.deepEqual(await capture(tx, scheduled, subject, lease), missing);
            assert.deepEqual(await authorize(tx, scheduled, subject, lease, handle), missing);
          }
          const unavailable = { ok: false, code: 'recipient_locale_unavailable' };
          assert.deepEqual(await capture(tx, scheduled, noPreference, lease), unavailable);
          assert.deepEqual(
            await authorize(tx, scheduled, noPreference, lease, handle),
            unavailable
          );
        });

        await admin`update "user" set role = 'staff' where id = ${member}`;
        assert.deepEqual(await prepare(handle), missing);
        await admin`update "user" set role = 'member', "emailVerified" = false where id = ${member}`;
        const unverified = { ok: false, code: 'recipient_unverified' };
        assert.deepEqual(await prepare(handle), unverified);
        assert.deepEqual(await scoped(tx => capture(tx, scheduled, member, lease)), unverified);
        await admin`update "user" set "emailVerified" = true where id = ${member}`;

        const save = (id: string) =>
          savePreferredLocale(
            mintTenantAuthority({
              tenantId: tenantA,
              purpose: 'session',
              principal: { ...principal, userId: id },
            }),
            { user: { id, role: 'member', tenantId: tenantA, accessTenantId: tenantA } },
            'mk'
          );
        assert.equal(await save(noPreference), 'saved');
        assert.ok((await scoped(tx => capture(tx, scheduled, noPreference, lease))).ok);
      }
    );
  });
});
