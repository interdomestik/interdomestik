import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

import { assertDisposableUrl } from '../src/disposable-client';
import {
  acceptanceEvidence,
  cleanup,
  fixtureWithText,
  migrateApprovedFixture,
  seedSubject,
  verifyReseed,
  withAcceptanceRuntime,
} from './legal-acceptance-command.test-support';
import {
  scratchServerMissing,
  withScratchDatabase,
  type ScratchClient,
} from './pg16/scratch-database';

const runtime = 'interdomestik_runtime_rls';
const tenant = 'wp13_command_tenant';
const otherTenant = 'wp13_command_other_tenant';
const pendingActor = 'wp13_pending';
const approvedActor = 'wp13_approved';
const rollbackActor = 'wp13_rollback';
const otherActor = 'wp13_other';

async function verifyCommands(t: TestContext, admin: ScratchClient) {
  // Resolve the downstream package through the application's installed public export.
  const webRequire = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
  const publicExport = webRequire.resolve('@interdomestik/domain-privacy/acceptance');
  const {
    acceptLegalDocuments,
    currentLegalDocuments,
    digestLegalDocument,
    readOwnAcceptanceState,
  } = await import(pathToFileURL(publicExport).href);
  const { mintTenantAuthority } = await import('../src/tenant-authority-registrar');
  const { withPrincipalTenantContext, sql } = await import('../src/index');

  const authorityFor = (userId: string) =>
    mintTenantAuthority({
      tenantId: tenant,
      purpose: 'session',
      principal: { userId, role: 'member', branchId: null, agentId: null },
    });
  const submission = {
    documents: currentLegalDocuments,
    attestations: { termsAccepted: true, privacyNoticeAcknowledged: true } as const,
  };
  const pending = fixtureWithText(currentLegalDocuments, 'en', false);
  const approved = fixtureWithText(currentLegalDocuments, 'de', true);

  await t.test('pending evidence does not admit in production', async () => {
    const authority = authorityFor(pendingActor);
    await withPrincipalTenantContext(authority, async tx => {
      const [row] = await tx.execute<{ role: string; bypass: boolean }>(sql`
        select current_user as role, (rolsuper or rolbypassrls) as bypass
        from pg_roles where rolname = current_user
      `);
      assert.deepEqual(row, { role: runtime, bypass: false });
    });
    assert.deepEqual(
      await acceptLegalDocuments(authority, submission, { ...pending, requireApproved: true }),
      { ok: false, code: 'legal_text_not_approved' }
    );
    assert.deepEqual(
      await acceptLegalDocuments(authority, submission, {
        ...pending,
        texts: pending.texts.map(text => ({
          ...text,
          values: [...text.values, 'Changed fixture'],
        })),
      }),
      { ok: false, code: 'legal_text_mismatch' }
    );
    assert.deepEqual(await acceptanceEvidence(admin, pendingActor), []);
    assert.deepEqual(await acceptLegalDocuments(authority, submission, pending), { ok: true });
    assert.equal((await acceptanceEvidence(admin, pendingActor)).length, 2);
    assert.deepEqual(await readOwnAcceptanceState(authority, false), { accepted: true });
    assert.deepEqual(await readOwnAcceptanceState(authority, true), {
      accepted: false,
      missing: currentLegalDocuments,
    });
  });

  await t.test(
    'approved text records the exact locale and digest with audit evidence',
    async () => {
      const authority = authorityFor(approvedActor);
      assert.deepEqual(await acceptLegalDocuments(authority, submission, approved), { ok: true });
      assert.deepEqual(await readOwnAcceptanceState(authority, true), { accepted: true });
      const rows = await acceptanceEvidence(admin, approvedActor);
      assert.equal(rows.length, 2);
      for (const text of approved.texts) {
        const digest = digestLegalDocument(text.values);
        assert.deepEqual(
          rows.find(row => row.document_kind === text.kind),
          {
            document_kind: text.kind,
            locale: approved.locale,
            text_sha256: digest,
            metadata: {
              kind: text.kind,
              version: text.version,
              locale: approved.locale,
              textSha256: digest,
            },
          }
        );
      }
    }
  );

  await t.test('the command rolls back both rows when its audit insert fails', async () => {
    await admin`
      create function wp13_fixture_refuse_audit() returns trigger language plpgsql as $$
      begin
        if new.actor_id = 'wp13_rollback' and new.action = 'privacy.legal_document_accepted' then
          raise exception 'WP-13 fixture audit insert failed' using errcode = '23514';
        end if;
        return new;
      end
      $$;
    `;
    await admin`create trigger wp13_fixture_refuse_audit before insert on audit_log
      for each row execute function wp13_fixture_refuse_audit()`;
    const authority = authorityFor(rollbackActor);
    await assert.rejects(
      acceptLegalDocuments(authority, submission, approved),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const { cause } = error;
        assert.ok(cause instanceof Error && 'code' in cause);
        assert.equal(cause.code, '23514');
        assert.equal(cause.message, 'WP-13 fixture audit insert failed');
        return true;
      }
    );
    assert.deepEqual(await acceptanceEvidence(admin, rollbackActor), []);
    const [audit] =
      await admin`select count(*)::int as count from audit_log where actor_id = ${rollbackActor}`;
    assert.equal(audit.count, 0);
    assert.equal((await readOwnAcceptanceState(authority, true)).accepted, false);
  });

  await t.test('A8 reverse: a WP-13 context sees only its own Free Start drafts', async () => {
    for (const [owner, scope] of [
      [approvedActor, tenant],
      [pendingActor, tenant],
      [otherActor, otherTenant],
    ]) {
      await admin`insert into free_start_drafts
        (tenant_id, access_tenant_id, owner_user_id, client_request_id, category, resume_step)
        values (${scope}, ${scope}, ${owner}, ${randomUUID()}, 'vehicle', 'category')`;
    }
    const rows = await withPrincipalTenantContext(authorityFor(approvedActor), tx =>
      tx.execute(sql`select owner_user_id from free_start_drafts`)
    );
    assert.deepEqual([...rows], [{ owner_user_id: approvedActor }]);
  });
}

test('WP-13a command and admission run against the restricted database role', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withScratchDatabase('wp13_command', async admin => {
    const createdRuntime =
      (await admin`select 1 from pg_roles where rolname = ${runtime}`).length === 0;
    const cleanupExisted =
      (await admin`select 1 from pg_roles where rolname = ${cleanup}`).length > 0;
    const priorRole = process.env.DB_RLS_ROLE;
    const priorRlsUrl = process.env.DATABASE_URL_RLS;
    const originalUrl = process.env.DATABASE_URL!;
    const [database] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(originalUrl);
    scratchUrl.pathname = `/${database.name}`;
    assertDisposableUrl(scratchUrl.toString());

    // The application's production transaction code uses the real guarded scratch client.
    // Only connection selection is supplied by the test.
    const clients = globalThis as typeof globalThis & {
      queryClientAdmin?: ScratchClient;
      queryClientRls?: ScratchClient;
    };
    assert.equal(clients.queryClientAdmin, undefined);
    assert.equal(clients.queryClientRls, undefined);
    clients.queryClientAdmin = admin;
    process.env.DB_RLS_ROLE = runtime;
    process.env.DATABASE_URL = scratchUrl.toString();

    try {
      if (createdRuntime)
        await admin`create role interdomestik_runtime_rls nologin nosuperuser nobypassrls`;
      await migrateApprovedFixture(admin);
      await admin`grant usage on schema public to interdomestik_runtime_rls`;
      await admin`grant select, insert, update, delete on "user", audit_log, free_start_drafts
        to interdomestik_runtime_rls`;
      for (const id of [tenant, otherTenant]) {
        await admin`insert into tenants (id, name, legal_name, country_code)
          values (${id}, 'Fixture', 'Fixture', 'MK')`;
      }
      for (const actor of [pendingActor, approvedActor, rollbackActor, otherActor]) {
        await seedSubject(
          admin,
          actor,
          actor === otherActor ? otherTenant : tenant,
          `${actor}@example.test`
        );
      }
      await withAcceptanceRuntime(admin, scratchUrl, async (client, url) => {
        process.env.DATABASE_URL_RLS = url;
        clients.queryClientRls = client;
        await verifyCommands(t, admin);
        await t.test('guarded tooling cleans and reseeds only the seeded subject', () =>
          verifyReseed(admin, pendingActor)
        );
      });
    } finally {
      delete clients.queryClientAdmin;
      delete clients.queryClientRls;
      process.env.DATABASE_URL = originalUrl;
      if (priorRlsUrl === undefined) delete process.env.DATABASE_URL_RLS;
      else process.env.DATABASE_URL_RLS = priorRlsUrl;
      if (priorRole === undefined) delete process.env.DB_RLS_ROLE;
      else process.env.DB_RLS_ROLE = priorRole;
      if (!cleanupExisted) await admin`drop role if exists interdomestik_seed_cleanup`;
      if (createdRuntime) {
        await admin`drop owned by interdomestik_runtime_rls`;
        await admin`drop role interdomestik_runtime_rls`;
      }
    }
  });
});
