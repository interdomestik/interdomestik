import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import type * as DomainClaims from '@interdomestik/domain-claims';
import { sql } from 'drizzle-orm';

import { mintTenantAuthority } from '../../src/tenant-authority';
import { mintTestTenantAuthority } from '../../src/testing/tenant-authority';
import { importDomain } from '../claim-correspondence-domain.fixture';
import {
  migrateLegalAcceptanceFixture,
  seedSubject,
  withAcceptanceRuntime,
} from '../legal-acceptance-command.test-support';
import {
  scratchServerMissing,
  withScratchDatabase,
  type ScratchClient,
} from '../pg16/scratch-database';

const runtime = 'interdomestik_runtime_rls';
const homeTenant = 'wp13_title_home';
const foreignTenant = 'wp13_title_foreign';
const own = { id: 'title-own', userId: 'title-member', title: 'Own claim title' };
const peer = { id: 'title-peer', userId: 'title-peer-member', title: 'Peer claim title' };
const foreign = {
  id: 'title-foreign',
  userId: 'title-foreign-member',
  title: 'Foreign claim title',
};
const delegated = { id: 'title-delegated', title: 'Delegated claim title' };

async function proveTitleReader(t: TestContext, client: ScratchClient) {
  const { getMemberClaimTitle } =
    await importDomain<Pick<typeof DomainClaims, 'getMemberClaimTitle'>>('');
  const { withTenantAuthority } = await import('../../src/tenant-authority-context');
  const memberSession = (tenantId: string, userId: string) =>
    mintTenantAuthority({
      purpose: 'session',
      tenantId,
      principal: { userId, role: 'member', branchId: null, agentId: null },
    });
  const authority = memberSession(homeTenant, own.userId);

  await t.test('the claim policy is active under the restricted runtime role', async () => {
    await withTenantAuthority(authority, async tx => {
      const [posture] = await tx.execute<{ role: string; bypass: boolean; active: boolean }>(sql`
        select current_user as role, (rolsuper or rolbypassrls) as bypass,
          row_security_active('public.claim'::regclass) as active
        from pg_roles where rolname = current_user
      `);
      assert.deepEqual(posture, { role: runtime, bypass: false, active: true });

      const rows = await tx.execute<{ id: string }>(sql`
        select id from public.claim where id in (${own.id}, ${peer.id}, ${foreign.id})
        order by id
      `);
      assert.deepEqual([...rows], [{ id: own.id }, { id: peer.id }]);
    });
  });

  await t.test('returns the title of a claim owned by the member', async subtest => {
    const begin = subtest.mock.method(client, 'begin');
    assert.equal(await getMemberClaimTitle({ authority, claimId: own.id }), own.title);
    assert.equal(begin.mock.callCount(), 1);
  });

  await t.test('hides a claim owned by another member in the same tenant', async () => {
    // The policy check above sees the peer's row, so this proves the reader's owner predicate.
    assert.equal(await getMemberClaimTitle({ authority, claimId: peer.id }), null);
  });

  await t.test('hides a claim from another tenant', async () => {
    // This fixture proves RLS isolation for a claim without delegated access to the home tenant.
    assert.equal(await getMemberClaimTitle({ authority, claimId: foreign.id }), null);
    assert.equal(
      await getMemberClaimTitle({
        authority: memberSession(foreignTenant, foreign.userId),
        claimId: foreign.id,
      }),
      foreign.title
    );
  });

  await t.test('hides a delegated foreign claim owned by the home member', async () => {
    // The row is visible under RLS via access_tenant_id and the owner matches the session.
    // Only the reader's tenant_id predicate can exclude it.
    await withTenantAuthority(authority, async tx => {
      const rows = await tx.execute<{ id: string }>(sql`
        select id from public.claim where id = ${delegated.id}
      `);
      assert.deepEqual([...rows], [{ id: delegated.id }]);
    });
    assert.equal(await getMemberClaimTitle({ authority, claimId: delegated.id }), null);
  });

  await t.test('refuses a non-session member authority before querying', async subtest => {
    const wrongPurpose = mintTestTenantAuthority(homeTenant, {
      userId: own.userId,
      role: 'member',
    });
    const begin = subtest.mock.method(client, 'begin');
    const unsafe = subtest.mock.method(client, 'unsafe');

    await assert.rejects(getMemberClaimTitle({ authority: wrongPurpose, claimId: own.id }), {
      name: 'UnauthorizedError',
      code: 'UNAUTHORIZED',
    });
    assert.equal(begin.mock.callCount(), 0);
    assert.equal(unsafe.mock.callCount(), 0);
  });
}

test('WP-13a member claim titles run under the restricted database role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withScratchDatabase('wp13_claim_title', async admin => {
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    const [existing] = await admin`select 1 from pg_roles where rolname = ${runtime}`;
    if (!existing)
      await admin`create role interdomestik_runtime_rls nologin nosuperuser nobypassrls`;

    try {
      await migrateLegalAcceptanceFixture(admin);
      await admin`grant usage on schema public to interdomestik_runtime_rls`;
      await admin`grant select (id, tenant_id, "userId", title) on public.claim to interdomestik_runtime_rls`;
      for (const tenantId of [homeTenant, foreignTenant]) {
        await admin`insert into tenants (id, name, legal_name, country_code)
          values (${tenantId}, 'Claim title fixture', 'Claim title fixture', 'MK')`;
      }
      for (const [claim, tenantId] of [
        [own, homeTenant],
        [peer, homeTenant],
        [foreign, foreignTenant],
      ] as const) {
        await seedSubject(admin, claim.userId, tenantId, `${claim.userId}@example.test`);
        await admin`insert into public.claim (id, tenant_id, "userId", title, category, "companyName")
          values (${claim.id}, ${tenantId}, ${claim.userId}, ${claim.title}, 'vehicle', 'Fixture')`;
      }
      await admin`insert into public.claim (
          id, tenant_id, access_tenant_id, "userId", title, category, "companyName"
        )
        values (${delegated.id}, ${foreignTenant}, ${homeTenant}, ${own.userId}, ${delegated.title}, 'vehicle', 'Fixture')`;

      await withAcceptanceRuntime(admin, scratchUrl, async (client, url) => {
        // Inject the guarded scratch pools before loading the actual domain and database modules.
        const pools = globalThis as typeof globalThis & {
          queryClientAdmin?: ScratchClient;
          queryClientRls?: ScratchClient;
        };
        assert.equal(pools.queryClientAdmin, undefined);
        assert.equal(pools.queryClientRls, undefined);
        const env = {
          DATABASE_URL: scratchUrl.toString(),
          DATABASE_URL_RLS: url,
          DB_RLS_ROLE: runtime,
        };
        const previous = Object.keys(env).map(key => [key, process.env[key]] as const);
        Object.assign(process.env, env);
        pools.queryClientAdmin = admin;
        pools.queryClientRls = client;
        try {
          await proveTitleReader(t, client);
        } finally {
          delete pools.queryClientAdmin;
          delete pools.queryClientRls;
          for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      });
    } finally {
      if (!existing) {
        await admin`drop owned by interdomestik_runtime_rls`;
        await admin`drop role interdomestik_runtime_rls`;
      }
    }
  });
});
