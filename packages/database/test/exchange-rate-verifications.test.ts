import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { proveVerificationMutationDenials } from './exchange-rate-verification-mutations.proof';
import {
  assertForeignVerificationParentsVisible,
  insertVerification,
  makeVerification,
  showForeignVerificationParents,
  type Verification,
} from './exchange-rate-verifications.fixture';
import { assertReleaseLoginPosture } from './exchange-rates-release.fixture';
import {
  restricted,
  runSequentially,
  runtimeRole,
  scratchServerMissing,
  withExchangeRateFixture,
} from './exchange-rates.fixture';
import { quoteIdentifier } from './rls-test-connection';

test('WP-07 verification invariants on PostgreSQL 16 under the restricted role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withExchangeRateFixture(async fixture => {
    const { admin, peer, tenantId, otherTenant, actor, withoutBook } = fixture;
    const [context] = await restricted(
      admin,
      tenantId,
      tx => tx`select
      current_database() as database, current_setting('server_version_num')::int as version,
      current_user as role, rolsuper, rolbypassrls,
      row_security_active('public.exchange_rate_verifications') as verifications,
      row_security_active('public.exchange_rate_verification_limits') as limits
      from pg_roles where rolname = current_user`
    );
    assert.match(context.database, /^wp07_payment_[a-f\d]{12}$/u);
    assert.ok(context.version >= 160000 && context.version < 170000);
    assert.equal(context.role, runtimeRole);
    assert.equal(context.rolsuper, false);
    assert.equal(context.rolbypassrls, false);
    assert.equal(context.verifications, true);
    assert.equal(context.limits, true);

    const rls = await admin`select relname, relrowsecurity, relforcerowsecurity from pg_class
      where oid in ('public.exchange_rate_verification_limits'::regclass,
        'public.exchange_rate_verifications'::regclass) order by relname`;
    assert.deepEqual(
      [...rls],
      ['exchange_rate_verification_limits', 'exchange_rate_verifications'].map(relname => ({
        relname,
        relrowsecurity: true,
        relforcerowsecurity: true,
      }))
    );

    await admin.unsafe(
      `grant select, update (id) on public.legal_entities to ${quoteIdentifier(runtimeRole)}`
    );
    const otherActor = randomUUID();
    await admin`insert into public."user"
      (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${otherActor}, ${otherTenant}, 'Test administrator', ${`${otherActor}@example.test`},
        true, 'tenant_admin', now(), now())`;
    const own = await makeVerification(fixture, tenantId, actor.id);
    const foreign = await makeVerification(fixture, otherTenant, otherActor);

    await t.test(
      'requires READ COMMITTED and replaces the supplied verification stamp',
      async () => {
        const insert = (isolation: 'read committed' | 'repeatable read' | 'serializable') =>
          restricted(admin, tenantId, tx => insertVerification(tx, own), runtimeRole, isolation);
        await runSequentially(['repeatable read', 'serializable'] as const, isolation =>
          assert.rejects(insert(isolation), {
            code: '23514',
            constraint_name: 'exchange_rate_verifications_read_committed_guard',
          })
        );
        const [{ count }] = await restricted(
          admin,
          tenantId,
          tx => tx`
        select count(*)::int as count from public.exchange_rate_verifications`
        );
        assert.equal(count, 0);
        assert.deepEqual([...(await insert('read committed'))], [{ server_stamp: true }]);
      }
    );

    await t.test('reads only access-tenant evidence and limits', async () => {
      await restricted(admin, otherTenant, tx => insertVerification(tx, foreign));
      const scopes = [
        { client: peer, access: undefined, ids: [], limits: [] },
        { client: admin, access: tenantId, ids: [own.id], limits: [tenantId] },
        { client: admin, access: otherTenant, ids: [foreign.id], limits: [otherTenant] },
      ];
      await runSequentially(scopes, ({ client, access, ids, limits }) =>
        restricted(
          client,
          access,
          async tx => {
            const evidenceRows = await tx`select id from public.exchange_rate_verifications`;
            const limitRows =
              await tx`select tenant_id from public.exchange_rate_verification_limits`;
            assert.deepEqual(
              evidenceRows.map(row => row.id),
              ids
            );
            assert.deepEqual(
              limitRows.map(row => row.tenant_id),
              limits
            );
          },
          runtimeRole,
          'read committed',
          { homeTenant: tenantId }
        )
      );
    });

    async function assertForeignInsertRefused(message: string, isolatePolicy: boolean) {
      const candidate = { ...foreign, id: randomUUID(), operation_key: randomUUID() };
      const countEvidence = async () => {
        const [{ count }] = await admin<{ count: number }[]>`
          select count(*)::int as count from public.exchange_rate_verifications`;
        return count;
      };
      const before = await countEvidence();
      await assert.rejects(
        restricted(
          admin,
          tenantId,
          async tx => {
            await assertForeignVerificationParentsVisible(tx, candidate);
            await tx`insert into public.exchange_rate_verifications ${tx(candidate)}`;
            assert.fail('Foreign verification insert was accepted');
          },
          runtimeRole,
          'read committed',
          {
            beforeRole: async tx => {
              await showForeignVerificationParents(tx, candidate);
              if (isolatePolicy) {
                // Isolate WITH CHECK in this rollback-only scratch transaction.
                await tx`alter table public.exchange_rate_verifications
                  disable trigger exchange_rate_verifications_insert_guard`;
              }
            },
          }
        ),
        { code: '42501', message }
      );
      assert.equal(await countEvidence(), before);
    }

    await t.test('WITH CHECK rejects a foreign insert after its parents are visible', async () => {
      await assertForeignInsertRefused(
        'new row violates row-level security policy for table "exchange_rate_verifications"',
        true
      );
    });

    await t.test('the insert guard independently refuses a foreign tenant', async () => {
      await assertForeignInsertRefused('Rate verification requires bound tenant', false);
    });

    await t.test(
      'refuses privileged release logins and SET ROLE to BYPASSRLS and accepts a restricted login',
      async () => {
        await assertReleaseLoginPosture(admin, tenantId, 3600);
      }
    );

    await t.test(
      'binds the date, decimal, actor and entity to the exact tenant evidence',
      async () => {
        const candidate = { ...own, id: randomUUID(), operation_key: randomUUID() };
        const cases: [Partial<Verification>, string, string][] = [
          [
            { rate_effective_on: '2000-01-04' },
            '23503',
            'exchange_rate_verifications_exact_rate_fk',
          ],
          [{ observed_rate: '61.51' }, '23503', 'exchange_rate_verifications_exact_rate_fk'],
          [
            { observed_rate: '61.500000001' },
            '23514',
            'exchange_rate_verifications_observed_rate_check',
          ],
          [{ observed_rate: 'NaN' }, '23514', 'exchange_rate_verifications_observed_rate_check'],
          [
            { observed_rate: 'Infinity' },
            '23514',
            'exchange_rate_verifications_observed_rate_check',
          ],
          [{ observed_rate: '0' }, '23514', 'exchange_rate_verifications_observed_rate_check'],
          [{ rate_effective_on: 'infinity' }, '23514', 'exchange_rate_verifications_finite_stamps'],
          [{ source_ref: 'nbrm:entry\n' }, '23514', 'exchange_rate_verifications_source_ref_check'],
          [{ verified_by: withoutBook.id }, '23503', 'exchange_rate_verifications_actor_fk'],
          [
            { legal_entity_id: foreign.legal_entity_id },
            '23514',
            'exchange_rate_verifications_active_entity',
          ],
          [{ book_id: foreign.book_id }, '23503', 'exchange_rate_verifications_book_fk'],
        ];
        await runSequentially(cases, ([changes, code, constraint_name]) =>
          assert.rejects(
            restricted(admin, tenantId, tx => insertVerification(tx, { ...candidate, ...changes })),
            { code, constraint_name }
          )
        );

        // The guard normally rejects this earlier. Isolate the actual FK in the rollback-only fixture.
        await assert.rejects(
          restricted(
            admin,
            tenantId,
            tx =>
              insertVerification(tx, {
                ...candidate,
                legal_entity_id: foreign.legal_entity_id,
                verified_at: '2000-01-03T00:00:00Z',
              }),
            runtimeRole,
            'read committed',
            {
              beforeRole: async tx => {
                await tx`alter table public.exchange_rate_verifications
              disable trigger exchange_rate_verifications_insert_guard`;
              },
            }
          ),
          { code: '23503', constraint_name: 'exchange_rate_verifications_entity_fk' }
        );
        const rows = await restricted(
          admin,
          tenantId,
          tx => tx`select id from public.exchange_rate_verifications`
        );
        assert.deepEqual([...rows], [{ id: own.id }]);
      }
    );

    await proveVerificationMutationDenials(t, fixture);
  }, 'expand');
});

test('WP-07 check windows and terminal transitions defend the contracted schema', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  const { proveOfficialCheckConstraints } = await import('./exchange-rate-checks.proof');
  await withExchangeRateFixture(proveOfficialCheckConstraints);
});

test('WP-07 representative PG16 head lookup uses the tenant and date key in order', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  const { proveHeadQueryPlan } = await import('./exchange-rate-checks.proof');
  await withExchangeRateFixture(proveHeadQueryPlan);
});
