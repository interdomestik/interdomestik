import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readExpectedLedger } from '../../../../../scripts/ci/runtime-attestation/journal.mjs';
import {
  assertE2eRuntimeTarget,
  openGuardedClient,
  resolveE2eRuntimeUrl,
} from '../../../../../scripts/e2e-runtime-role.mjs';
import {
  documentId,
  DOCUMENT_BUDGET,
  measureRead,
  type ClaimReadFixture,
} from './admin-claim-detail-plans';
import { observeRestrictedPool, type Pool, type RunSql } from './admin-claim-detail-query-probe';

type Controller = typeof import('@interdomestik/database/db').dbRls.$client;
type FixtureWriter = Parameters<Parameters<Controller['begin']>[1]>[0];

async function assertJournalBuilt(controller: Controller) {
  const { entries } = readExpectedLedger(resolve(process.cwd(), '../..'));
  const rows = await controller<{ hash: string; createdAt: string }[]>`
    select hash, created_at::text as "createdAt" from drizzle.__drizzle_migrations order by id
  `;
  assert.deepEqual(
    rows.map(({ hash, createdAt }) => ({ hash, createdAt })),
    entries.map(({ hash, when }: { hash: string; when: number }) => ({
      hash,
      createdAt: String(when),
    })),
    'The verification database must match the repository migration journal'
  );
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
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
    { claimId: `${base}-mixed-${size}`, tenant: f.home, size, label: `mixed-${size}` },
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
    for (const { claimId, tenant, size, label } of cases) {
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
          case when ${label.startsWith('mixed-')} and d % 2 = 1 then ${f.home} else ${accessTenant} end,
          'Synthetic document', ${claimId} || '/' || d,
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

async function assertSentinels(run: RunSql, fixture: ClaimReadFixture) {
  const [counts] = await run<{ explicit: number; fallback: number }[]>(
    `select count(*) filter (where access_tenant_id = $2)::int as explicit,
       count(*) filter (where access_tenant_id is null)::int as fallback
     from public.claim_documents where claim_id = $1`,
    [fixture.localId, fixture.home]
  );
  assert.deepEqual(
    counts,
    { explicit: 13, fallback: 14 },
    'Both document access arms must still have rows under tenant RLS alone'
  );
}

async function runReader(f: ClaimReadFixture, controller: Controller, getPool: () => Pool) {
  const { E2E_USER_IDS } = await import('@interdomestik/database');
  const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
  const { mintTestTenantAuthority } =
    await import('@interdomestik/database/testing/tenant-authority');
  const { readOpsClaimDetailData: read } =
    await import('@interdomestik/domain-documents/claim-documents');

  await assertRlsConnectionRoleReady();
  const pool = getPool();
  const session = (tenant: string, userId: string, role: string, branchId?: string) =>
    mintTestTenantAuthority(tenant, { userId, role, branchId, purpose: 'session' });
  const admin = session(f.home, E2E_USER_IDS.KS_ADMIN, 'admin');
  const manager = session(f.home, E2E_USER_IDS.KS_BRANCH_MANAGER, 'branch_manager', f.branchA);
  const current = session(f.access, E2E_USER_IDS.MK_ADMIN, 'admin');
  const currentManager = session(
    f.access,
    E2E_USER_IDS.MK_BRANCH_MANAGER,
    'branch_manager',
    'mk_branch_a'
  );
  const staff = session(f.home, E2E_USER_IDS.KS_STAFF, 'staff');
  const mismatched = mintTestTenantAuthority(f.home, {
    userId: E2E_USER_IDS.KS_ADMIN,
    role: 'admin',
    accessTenantId: f.access,
    purpose: 'session',
  });
  const nonSession = mintTestTenantAuthority(f.home, {
    userId: E2E_USER_IDS.KS_ADMIN,
    role: 'admin',
  });
  const fabricated = Object.freeze({}) as TenantAuthority;
  const now = Date.now;
  let expired: TenantAuthority;
  try {
    Date.now = () => now() - 60 * 60_000;
    expired = session(f.home, E2E_USER_IDS.KS_ADMIN, 'admin');
  } finally {
    Date.now = now;
  }

  for (const { authority, claimId, claimReads, label } of [
    {
      authority: session(f.home, E2E_USER_IDS.KS_MEMBER_A2, 'member'),
      claimId: f.localId,
      claimReads: 0,
      label: 'wrong-user member',
    },
    { authority: staff, claimId: f.localId, claimReads: 0, label: 'staff' },
    {
      authority: session(f.home, E2E_USER_IDS.KS_BRANCH_MANAGER, 'branch_manager'),
      claimId: f.localId,
      claimReads: 0,
      label: 'branchless manager',
    },
    { authority: manager, claimId: f.wrongBranchId, claimReads: 1, label: 'other branch' },
    { authority: admin, claimId: f.transferredId, claimReads: 1, label: 'former access tenant' },
    { authority: current, claimId: f.localId, claimReads: 1, label: 'wrong access tenant' },
    { authority: mismatched, claimId: f.localId, claimReads: 0, label: 'mismatched tenant IDs' },
    { authority: nonSession, claimId: f.localId, claimReads: 0, label: 'non-session authority' },
  ]) {
    await observeRestrictedPool(
      pool,
      async traces => {
        assert.equal(await read({ authority, claimId }), null, label);
        assert.equal(traces.length, claimReads, label);
        assert.deepEqual(
          traces.flatMap(trace => trace.reads),
          claimReads ? ['claim'] : [],
          label
        );
      },
      {
        afterRead: async (kind, run) => {
          if (kind !== 'claim') return;
          const [row] = await run<{ count: number }[]>(
            'select count(*)::int as count from public.claim_documents where claim_id = $1',
            [claimId]
          );
          assert.equal(row?.count, 1, `${label}: the sentinel must be readable under RLS alone`);
        },
      }
    );
  }
  await observeRestrictedPool(pool, async traces => {
    await assert.rejects(
      read({ authority: fabricated, claimId: f.localId }),
      /Unrecognized tenant authority/
    );
    await assert.rejects(
      read({ authority: expired, claimId: f.localId }),
      /Expired tenant authority/
    );
    assert.deepEqual(traces, []);
  });

  function assertPage(
    documents: NonNullable<Awaited<ReturnType<typeof read>>>['documents'],
    ids: string[],
    nextCursor: string | null
  ) {
    assert.equal(documents.kind, 'page');
    assert.deepEqual(
      documents.items.map(item => item.id),
      ids
    );
    assert.equal(documents.nextCursor, nextCursor);
  }

  const firstIds = (claimId: string) =>
    Array.from({ length: 25 }, (_, i) => documentId(claimId, i));
  await observeRestrictedPool(pool, async traces => {
    const result = await read({
      authority: current,
      claimId: f.transferredId,
      staffSearch: f.prefix,
    });
    assert.ok(result);
    assertPage(result.documents, firstIds(f.transferredId), documentId(f.transferredId, 24));
    assert.equal(result.staffPage?.items.length, 1);
    assert.equal(
      traces.length,
      1,
      'Claim, documents and staff must share one restricted transaction'
    );
    assert.deepEqual(traces[0].reads, ['claim', 'documents', 'staff']);
  });
  await observeRestrictedPool(pool, async traces => {
    const result = await read({ authority: manager, claimId: f.localId, staffSearch: f.prefix });
    assert.ok(result);
    assert.deepEqual(result.documents, { kind: 'summary', count: 27 });
    assert.equal(result.staffPage, null);
    assert.equal(traces.length, 1);
    assert.deepEqual(traces[0].reads, ['claim', 'documents']);
  });

  const first = await read({ authority: admin, claimId: f.localId });
  assert.ok(first);
  assertPage(first.documents, firstIds(f.localId), documentId(f.localId, 24));
  assert.equal(first.documents.kind, 'page');
  const documentsAfter = first.documents.nextCursor;
  assert.ok(documentsAfter);
  let pausedOnce = false;
  const paused = deferred();
  const resume = deferred();
  await observeRestrictedPool(
    pool,
    async traces => {
      const authorized = read({ authority: admin, claimId: f.localId, documentsAfter });
      try {
        await Promise.race([
          paused.promise,
          authorized.then(() => assert.fail('Authorized page did not pause')),
        ]);
        const denied = await read({ authority: current, claimId: f.localId, documentsAfter });
        assert.equal(denied, null);
        assert.equal(traces.length, 2);
        assert.notEqual(traces[0].pid, traces[1].pid);
        assert.deepEqual(traces[1].reads, ['claim']);
      } finally {
        resume.release();
        const continued = await authorized;
        assert.ok(continued);
        assertPage(
          continued.documents,
          [documentId(f.localId, 25), documentId(f.localId, 26)],
          null
        );
      }
    },
    {
      beforeDocuments: async () => {
        // A denied regression reaching this hook must fail the trace assertion instead of waiting.
        if (!pausedOnce) {
          pausedOnce = true;
          paused.release();
          await resume.promise;
        }
      },
    }
  );

  for (const { label, authority, branchId, accessTenant } of [
    { label: 'branch count', authority: manager, branchId: f.branchB, accessTenant: null },
    {
      label: 'access tenant metadata',
      authority: admin,
      branchId: f.branchA,
      accessTenant: f.access,
    },
    {
      label: 'access tenant count',
      authority: manager,
      branchId: f.branchA,
      accessTenant: f.access,
    },
  ]) {
    const move = async (writer: FixtureWriter, readerPid?: number) => {
      if (readerPid !== undefined) {
        const [row] = await writer`select pg_backend_pid() as pid`;
        assert.notEqual(row.pid, readerPid, label);
      }
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
      const observed = await observeRestrictedPool(
        pool,
        () => read({ authority, claimId: f.localId }),
        {
          beforeDocuments: async (run, pid) => {
            await controller.begin(writer => move(writer, pid));
            await assertSentinels(run, f);
          },
        }
      );
      assert.ok(observed, label);
      assert.deepEqual(
        observed.documents,
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
        await move(writer);
        // READ COMMITTED sees the original row while the move remains uncommitted.
        const beforeCommit = await observeRestrictedPool(
          pool,
          () => read({ authority, claimId: f.localId }),
          {
            beforeDocuments: async (run, pid) => {
              assert.notEqual(pid, row.pid, label);
              await assertSentinels(run, f);
            },
          }
        );
        assert.ok(beforeCommit, label);
        if (authority === manager) {
          assert.deepEqual(beforeCommit.documents, { kind: 'summary', count: 27 }, label);
        } else {
          assertPage(beforeCommit.documents, firstIds(f.localId), documentId(f.localId, 24));
        }
      });
      await observeRestrictedPool(pool, async traces => {
        assert.equal(await read({ authority, claimId: f.localId }), null, label);
        assert.deepEqual(
          traces.map(trace => trace.reads),
          [['claim']],
          label
        );
      });
    } finally {
      await restore();
    }
  }

  if (process.env.WP19_EXPLAIN !== '1') return { restricted: true, misses: [] };
  const plans = await seedPlanData(controller, f, E2E_USER_IDS.KS_MEMBER, async cases => {
    const evidence: Awaited<ReturnType<typeof measureRead>>[] = [];
    for (const { claimId, tenant, size, label } of cases) {
      const metadataAuthority = tenant === f.home ? admin : current;
      const countAuthority = tenant === f.home ? manager : currentManager;
      const id = (index: number) => documentId(claimId, index, 4);
      const skip = size === 500 ? 474 : 24;
      for (const [phase, authority, after] of [
        ['first', metadataAuthority, undefined],
        ['continuation', metadataAuthority, id(skip)],
        ['count', countAuthority, undefined],
      ] as const) {
        const start = evidence.length;
        const result = await observeRestrictedPool(
          pool,
          () => read({ authority, claimId, documentsAfter: after }),
          {
            afterRead: async (kind, run, query, checkoutAndBeginMs) => {
              if (kind === 'documents') {
                evidence.push(
                  await measureRead(run, query, `${label}/${phase}`, checkoutAndBeginMs)
                );
              }
            },
          }
        );
        assert.equal(evidence.length, start + 1);
        assert.ok(result, label);
        if (phase === 'count') {
          assert.deepEqual(result.documents, { kind: 'summary', count: size }, label);
        } else {
          const offset = phase === 'first' ? 0 : skip + 1;
          assertPage(
            result.documents,
            Array.from({ length: Math.min(25, size - offset) }, (_, i) => id(offset + i)),
            phase === 'first' ? id(24) : null
          );
        }
      }
    }
    for (const [label, staffAfter] of [
      ['staff/first', undefined],
      ['staff/continuation', f.staffAfter],
    ] as const) {
      const start = evidence.length;
      const result = await observeRestrictedPool(
        pool,
        () => read({ authority: admin, claimId: f.localId, staffSearch: f.prefix, staffAfter }),
        {
          afterRead: async (kind, run, query, checkoutAndBeginMs) => {
            if (kind === 'staff')
              evidence.push(await measureRead(run, query, label, checkoutAndBeginMs));
          },
        }
      );
      assert.equal(evidence.length, start + 1);
      assert.equal(result?.staffPage?.items.length, staffAfter ? 1 : 25);
      assert.equal(result.staffPage.nextCursor, staffAfter ? null : f.staffAfter);
    }
    return evidence;
  });
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
    await assertJournalBuilt(controller);
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
