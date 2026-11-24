import type { TenantTransaction } from '@interdomestik/database';
import type { VisibleOpsClaim } from '@interdomestik/domain-claims/admin-claims/visible-ops-claim';
import { count, eq, sql } from 'drizzle-orm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  E2E_RUNTIME_ROLE,
  assertE2eRuntimeTarget,
  openGuardedClient,
  resolveE2eRuntimeUrl,
} from '../../../../../scripts/e2e-runtime-role.mjs';
import {
  captureQueries,
  documentId,
  DOCUMENT_BUDGET,
  measureRead,
  type ClaimReadFixture,
} from './admin-claim-detail-plans';

type Controller = typeof import('@interdomestik/database/db').dbRls.$client;
type FixtureWriter = Parameters<Parameters<Controller['begin']>[1]>[0];
type Pool = {
  begin: <T>(callback: (client: unknown) => Promise<T>) => Promise<T>;
  end: (options: { timeout: number }) => Promise<void>;
};

async function observeRestrictedPool<T>(
  connection: Pool,
  work: (stats: { transactions: number; checkoutAndBeginMs: number }) => Promise<T>
) {
  const stats = { transactions: 0, checkoutAndBeginMs: 0 };
  const originalBegin = connection.begin;
  connection.begin = function timedBegin<R>(callback: (client: unknown) => Promise<R>) {
    stats.transactions++;
    const started = performance.now();
    return originalBegin<R>(client => {
      stats.checkoutAndBeginMs = performance.now() - started;
      return callback(client);
    });
  };
  try {
    return await work(stats);
  } finally {
    connection.begin = originalBegin;
  }
}

async function backendPid(tx: TenantTransaction) {
  const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  assert.ok(row?.pid > 0);
  return row.pid;
}

async function assertRestricted(tx: TenantTransaction) {
  const [row] = await tx.execute<{ restricted: boolean }>(sql`
    select current_user = ${E2E_RUNTIME_ROLE} and current_user = session_user
      and rolcanlogin and not rolbypassrls and not rolsuper
      and row_security_active('public.claim'::regclass)
      and row_security_active('public.claim_documents'::regclass) as restricted
    from pg_roles where rolname = current_user
  `);
  assert.equal(row?.restricted, true, 'Expected the non-owning restricted LOGIN with active RLS');
}

async function seedPlanData<T>(
  controller: Controller,
  f: ClaimReadFixture,
  member: string,
  work: (cases: { claimId: string; tenant: string; size: number; label: string }[]) => Promise<T>
) {
  const base = `${f.prefix}-volume`;
  const cases = [27, 500].flatMap(size => [
    { claimId: `${base}-null-${size}`, tenant: f.home, size, label: `null-home-${size}` },
    { claimId: `${base}-access-${size}`, tenant: f.access, size, label: `explicit-access-${size}` },
  ]);
  const noisePrefix = `${base}-noise-`;
  await controller.begin(async tx => {
    await tx`
      insert into public.claim (id, tenant_id, "userId", title, category, "companyName")
      select ${noisePrefix} || n, case when n % 4 < 2 then ${f.home} else ${f.access} end,
        ${member}, 'Synthetic unrelated claim', 'other', 'Synthetic company'
      from generate_series(1, 1000) as series(n)
    `;
    await tx`
      insert into public.claim_documents
        (id, claim_id, tenant_id, access_tenant_id, name, file_path, file_type, file_size, uploaded_by)
      select ${noisePrefix} || n || '-doc-' || d, ${noisePrefix} || n,
        case when n % 4 < 2 then ${f.home} else ${f.access} end,
        case when n % 4 = 0 then ${f.home} when n % 4 = 2 then ${f.access} end,
        'Synthetic document', ${noisePrefix} || n || '/' || d, 'application/pdf', 1, ${member}
      from generate_series(1, 1000) as series(n)
      cross join generate_series(0, 99) as documents(d)
    `;
    for (const { claimId, tenant, size } of cases) {
      const accessTenant = tenant === f.home ? null : tenant;
      const branchId = tenant === f.home ? f.branchA : 'mk_branch_a';
      await tx`
        insert into public.claim
          (id, tenant_id, access_tenant_id, branch_id, "userId", title, category, "companyName")
        values (${claimId}, ${f.home}, ${accessTenant}, ${branchId}, ${member},
          'Synthetic measured claim', 'other', 'Synthetic company')
      `;
      await tx`
        insert into public.claim_documents
          (id, claim_id, tenant_id, access_tenant_id, name, file_path, file_type, file_size, uploaded_by)
        select ${claimId} || '-doc-' || lpad(d::text, 4, '0'), ${claimId}, ${f.home},
          ${accessTenant}, 'Synthetic document', ${claimId} || '/' || d,
          'application/pdf', 1, ${member}
        from generate_series(0, ${size - 1}) as documents(d)
      `;
    }
  });
  try {
    await controller`analyze public.claim_documents`;
    await controller`analyze public.claim`;
    await controller`analyze public."user"`;
    return await work(cases);
  } finally {
    const caseIds = cases.map(({ claimId }) => claimId);
    await controller.begin(async tx => {
      await tx`
        delete from public.claim_documents where claim_id in ${tx(caseIds)}
          or claim_id like ${noisePrefix + '%'}
      `;
      await tx`
        delete from public.claim where id in ${tx(caseIds)}
          or id like ${noisePrefix + '%'}
      `;
    });
  }
}

async function runReader(f: ClaimReadFixture, controller: Controller, pool: () => Pool) {
  const { claimDocuments, E2E_USER_IDS } = await import('@interdomestik/database');
  const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  const { mintTestTenantAuthority } =
    await import('@interdomestik/database/testing/tenant-authority');
  const { getVisibleOpsClaim } =
    await import('@interdomestik/domain-claims/admin-claims/visible-ops-claim');
  const { listVisibleClaimDocuments, OPS_CLAIM_DOCUMENT_PAGE_SIZE } =
    await import('@interdomestik/domain-documents/claim-documents');
  const { searchAssignableStaff } =
    await import('@interdomestik/domain-users/admin/search-assignable-staff');

  await assertRlsConnectionRoleReady();
  const session = (tenant: string, userId: string, role: string, branchId?: string) =>
    mintTestTenantAuthority(tenant, { userId, role, branchId, purpose: 'session' });
  const admin = session(f.home, E2E_USER_IDS.KS_ADMIN, 'admin');
  const manager = session(f.home, E2E_USER_IDS.KS_BRANCH_MANAGER, 'branch_manager', f.branchA);
  const current = session(f.access, E2E_USER_IDS.MK_ADMIN, 'admin');
  const member = session(f.home, E2E_USER_IDS.KS_MEMBER_A2, 'member');
  const staff = session(f.home, E2E_USER_IDS.KS_STAFF, 'staff');
  const mismatched = mintTestTenantAuthority(f.home, {
    userId: E2E_USER_IDS.KS_ADMIN,
    role: 'admin',
    accessTenantId: f.access,
    purpose: 'session',
  });

  const list = (tx: TenantTransaction, visibleClaim: VisibleOpsClaim, afterId?: string) =>
    listVisibleClaimDocuments(tx, { visibleClaim, afterId, limit: OPS_CLAIM_DOCUMENT_PAGE_SIZE });
  const rawCount = async (tx: TenantTransaction, claimId: string) => {
    const [row] = await tx
      .select({ count: count() })
      .from(claimDocuments)
      .where(eq(claimDocuments.claimId, claimId));
    return row.count;
  };
  async function denyProof(tx: TenantTransaction, proof: VisibleOpsClaim) {
    const queries: { text: string; binds: unknown[] }[] = [];
    await captureQueries(tx, queries, () =>
      assert.rejects(list(tx, proof), /Invalid visible claim proof/)
    );
    assert.equal(queries.length, 0, 'Invalid proof reached document SQL');
  }

  for (const { authority, claimId, readable } of [
    { authority: member, claimId: f.localId, readable: 27 },
    { authority: manager, claimId: f.wrongBranchId, readable: 1 },
    { authority: staff, claimId: f.localId, readable: 27 },
    { authority: admin, claimId: f.transferredId, readable: 1 },
  ]) {
    assert.equal(
      await getVisibleOpsClaim({ authority, claimId }, async () =>
        assert.fail('Refused claim opened')
      ),
      null
    );
    await withTenantAuthority(authority, async tx => {
      await assertRestricted(tx);
      assert.equal(
        await rawCount(tx, claimId),
        readable,
        'Denial fixture must be readable by tenant RLS alone'
      );
      const fabricated = { documentScope: () => ({ claimId, authority }) };
      await denyProof(tx, fabricated as unknown as VisibleOpsClaim);
    });
  }
  assert.equal(
    await getVisibleOpsClaim({ authority: mismatched, claimId: f.localId }, async () =>
      assert.fail('Mismatched authority entered claim callback')
    ),
    null
  );

  const page = await observeRestrictedPool(pool(), async stats => {
    const result = await getVisibleOpsClaim(
      { authority: current, claimId: f.transferredId },
      async (tx, proof) => {
        const pid = await backendPid(tx);
        await assertRestricted(tx);
        const documents = await list(tx, proof);
        const staffPage = await searchAssignableStaff(tx, { authority: current, search: f.prefix });
        assert.equal(staffPage.items.length, 1);
        assert.equal(await backendPid(tx), pid);
        return documents;
      }
    );
    assert.equal(
      stats.transactions,
      1,
      'Claim, documents and staff must share one restricted transaction'
    );
    return result;
  });
  assert.equal(page?.kind, 'page');
  assert.deepEqual(
    page.items.map(item => item.id),
    Array.from({ length: 25 }, (_, i) => documentId(f.transferredId, i))
  );
  assert.equal(page.nextCursor, documentId(f.transferredId, 24));
  assert.deepEqual(await getVisibleOpsClaim({ authority: manager, claimId: f.localId }, list), {
    kind: 'summary',
    count: 27,
  });

  const expired = await getVisibleOpsClaim(
    { authority: admin, claimId: f.localId },
    async (tx, proof) => {
      const originalPid = await backendPid(tx);
      // The original callback remains live during replay on a second same-tenant connection.
      await withTenantAuthority(admin, async otherTx => {
        assert.notEqual(await backendPid(otherTx), originalPid);
        assert.equal(await rawCount(otherTx, f.localId), 27);
        await denyProof(otherTx, proof);
      });
      const live = await list(tx, proof);
      assert.equal(live.kind, 'page');
      assert.equal(live.nextCursor, documentId(f.localId, 24));
      return { tx, proof };
    }
  );
  assert.ok(expired);
  await denyProof(expired.tx, expired.proof);

  for (const { label, authority, branchId, accessTenant } of [
    { label: 'branch', authority: manager, branchId: f.branchB, accessTenant: null },
    { label: 'access tenant', authority: admin, branchId: f.branchA, accessTenant: f.access },
    {
      label: 'access tenant count',
      authority: manager,
      branchId: f.branchA,
      accessTenant: f.access,
    },
  ]) {
    const move = async (writer: FixtureWriter) => {
      const changed = await writer`
        update public.claim set branch_id = ${branchId}, access_tenant_id = ${accessTenant}
        where id = ${f.localId} returning id
      `;
      assert.equal(changed.length, 1, label);
    };
    const restore = () => controller`
      update public.claim set branch_id = ${f.branchA}, access_tenant_id = null where id = ${f.localId}
    `;

    try {
      const observed = await getVisibleOpsClaim(
        { authority, claimId: f.localId },
        async (tx, proof) => {
          const readerPid = await backendPid(tx);
          await assertRestricted(tx);
          await controller.begin(async writer => {
            const [row] = await writer`select pg_backend_pid() as pid`;
            assert.notEqual(row.pid, readerPid, label);
            await move(writer);
          });
          assert.equal(await rawCount(tx, f.localId), 27, label);
          return list(tx, proof);
        }
      );
      assert.deepEqual(
        observed,
        authority === manager
          ? { kind: 'summary', count: 0 }
          : { kind: 'page', items: [], nextCursor: null },
        label
      );
    } finally {
      await restore();
    }

    try {
      await controller.begin(async writer => {
        const [row] = await writer`select pg_backend_pid() as pid`;
        const beforeMove = await getVisibleOpsClaim(
          { authority, claimId: f.localId },
          async (tx, proof) => {
            assert.notEqual(await backendPid(tx), row.pid, label);
            assert.equal(await rawCount(tx, f.localId), 27, label);
            return list(tx, proof);
          }
        );
        if (authority === manager) {
          assert.deepEqual(beforeMove, { kind: 'summary', count: 27 }, label);
        } else {
          assert.equal(beforeMove?.kind, 'page', label);
          assert.equal(beforeMove.items.length, 25, label);
          assert.equal(beforeMove.nextCursor, documentId(f.localId, 24), label);
        }
        await move(writer);
      });
      await withTenantAuthority(authority, async tx => {
        assert.equal(await rawCount(tx, f.localId), 27, label);
      });
      assert.equal(
        await getVisibleOpsClaim({ authority, claimId: f.localId }, async () => assert.fail(label)),
        null
      );
    } finally {
      await restore();
    }
  }

  if (process.env.WP19_EXPLAIN !== '1') return { restricted: true, misses: [] };
  const plans = await seedPlanData(controller, f, E2E_USER_IDS.KS_MEMBER, cases =>
    observeRestrictedPool(pool(), async stats => {
      const evidence = [];
      for (const { claimId, tenant, size, label } of [
        ...cases,
        { claimId: f.localId, tenant: f.home, size: 27, label: 'mixed-27' },
      ]) {
        const metadataAuthority = tenant === f.home ? admin : current;
        const countAuthority =
          tenant === f.home
            ? manager
            : session(f.access, E2E_USER_IDS.MK_BRANCH_MANAGER, 'branch_manager', 'mk_branch_a');
        const measuredDocumentId = (index: number) =>
          documentId(claimId, index, label === 'mixed-27' ? 2 : 4);

        const first = await getVisibleOpsClaim(
          { authority: metadataAuthority, claimId },
          async (tx, proof) => {
            await assertRestricted(tx);
            return measureRead(
              tx,
              `${label}/first`,
              'claim_documents',
              stats.checkoutAndBeginMs,
              () => list(tx, proof)
            );
          }
        );
        assert.equal(first?.result.kind, 'page', label);
        assert.deepEqual(
          first.result.items.map(item => item.id),
          Array.from({ length: 25 }, (_, i) => measuredDocumentId(i))
        );
        assert.equal(first.result.nextCursor, measuredDocumentId(24), label);
        evidence.push(first.evidence);

        const skip = size === 500 ? 474 : 24;
        const continued = await getVisibleOpsClaim(
          { authority: metadataAuthority, claimId },
          async (tx, proof) => {
            await assertRestricted(tx);
            return measureRead(
              tx,
              `${label}/continuation`,
              'claim_documents',
              stats.checkoutAndBeginMs,
              () => list(tx, proof, measuredDocumentId(skip))
            );
          }
        );
        assert.equal(continued?.result.kind, 'page', label);
        assert.deepEqual(
          continued.result.items.map(item => item.id),
          Array.from({ length: size - skip - 1 }, (_, i) => measuredDocumentId(skip + 1 + i))
        );
        assert.equal(continued.result.nextCursor, null, label);
        evidence.push(continued.evidence);

        const summary = await getVisibleOpsClaim(
          { authority: countAuthority, claimId },
          async (tx, proof) => {
            await assertRestricted(tx);
            return measureRead(
              tx,
              `${label}/count`,
              'claim_documents',
              stats.checkoutAndBeginMs,
              () => list(tx, proof)
            );
          }
        );
        assert.deepEqual(summary?.result, { kind: 'summary', count: size }, label);
        assert.ok(summary);
        evidence.push(summary.evidence);
      }
      for (const [label, afterId] of [
        ['staff/first', undefined],
        ['staff/continuation', f.staffAfter],
      ] as const) {
        const measured = await withTenantAuthority(admin, async tx => {
          await assertRestricted(tx);
          return measureRead(tx, label, 'user', stats.checkoutAndBeginMs, () =>
            searchAssignableStaff(tx, { authority: admin, search: f.prefix, afterId })
          );
        });
        assert.equal(measured.result.items.length, afterId ? 1 : 25);
        assert.equal(measured.result.nextCursor, afterId ? null : f.staffAfter);
        evidence.push(measured.evidence);
      }
      return evidence;
    })
  );
  return {
    restricted: true,
    caseVolume: { unrelatedClaims: 1000, unrelatedDocuments: 100_000 },
    budget: DOCUMENT_BUDGET,
    misses: plans.filter(plan => !plan.passed).map(plan => plan.label),
    plans,
  };
}

async function main() {
  const adminUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  assertE2eRuntimeTarget(adminUrl);
  process.env.DATABASE_URL = adminUrl;
  process.env.DATABASE_URL_RLS = resolveE2eRuntimeUrl(
    adminUrl,
    process.env.E2E_SERVER_DATABASE_URL_RLS
  );
  process.env.REQUIRE_RLS_INTEGRATION = '1';
  process.env.DB_RLS_ROLE = '';
  process.env.DB_MAX_CONNECTIONS = '2';

  const fixture: ClaimReadFixture = JSON.parse(process.argv[2]);
  const controller: Controller = await openGuardedClient(adminUrl, 'wp19_fixture_controller');
  const globals = globalThis as typeof globalThis & {
    queryClientRls?: Pool;
    queryClientAdmin?: Pool;
  };
  const pool = () => {
    assert.ok(globals.queryClientRls);
    return globals.queryClientRls;
  };
  try {
    const result = await runReader(fixture, controller, pool);
    process.stdout.write(`WP19_RESULT ${JSON.stringify(result)}\n`);
  } finally {
    const pools = new Set([controller, globals.queryClientAdmin, globals.queryClientRls]);
    await Promise.all([...pools].map(client => client?.end({ timeout: 2 })));
  }
}

main().catch((error: unknown) => {
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const location = /admin-claim-detail-[\w-]+\.ts:\d+:\d+/u.exec(stack)?.[0];
  process.stderr.write(`WP19_ERROR ${location ?? 'unknown'}\n`);
  process.exitCode = 1;
});
