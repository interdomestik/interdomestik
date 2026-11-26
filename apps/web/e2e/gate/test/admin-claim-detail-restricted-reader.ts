import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readExpectedLedger } from '../../../../../scripts/ci/runtime-attestation/journal.mjs';
import {
  assertE2eRuntimeTarget,
  openGuardedClient,
  resolveE2eRuntimeUrl,
} from '../../../../../scripts/e2e-runtime-role.mjs';
import { assertRestrictedDocumentReads } from './admin-claim-detail-document-assertions';
import { measureRestrictedClaimReads } from './admin-claim-detail-explain';
import type { ClaimReadFixture, FixtureController } from './admin-claim-detail-plans';
import { observeRestrictedPool, type Pool } from './admin-claim-detail-query-probe';

async function assertJournalBuilt(controller: FixtureController) {
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

async function runReader(f: ClaimReadFixture, controller: FixtureController, getPool: () => Pool) {
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

  await assertRestrictedDocumentReads(f, controller, pool, read, { admin, manager, current });

  if (process.env.WP19_EXPLAIN !== '1') return { restricted: true, misses: [] };
  return measureRestrictedClaimReads(controller, f, E2E_USER_IDS.KS_MEMBER, pool, read, {
    admin,
    manager,
    current,
    currentManager,
  });
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
  const controller: FixtureController = await openGuardedClient(
    adminUrl,
    'wp19_fixture_controller'
  );
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
