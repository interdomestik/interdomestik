import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimMessages } from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import type { TenantAuthority } from '../src/tenant-authority';
import { TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

const POOL_SIZE = 4;
const CONTEXTS = 12;
const TEST_LIFETIME_MS = 60 * 60_000;

class DeliberateAbort extends Error {}

type Observation = {
  index: number;
  pid?: number;
  expected: string;
  gucs?: { tenant: string; access: string };
  seen: string[];
};

// Plan070 §4: the same isolation U2-b proves for withTenantContext, proved through the entry the
// application calls. Every transaction below is opened by withTenantAuthority with a registered
// token, on the restricted LOGIN role, so the descriptor alone decides the tenant GUCs.
test('withTenantAuthority confines the restricted role under concurrency, expiry and rollback', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: String(POOL_SIZE) });
  if (!session) return;
  const { adminDb, fixture, dbRls } = session;
  const { ks, mk } = fixture;
  const [{ withTenantAuthority }, { mintTestTenantAuthority }, { mintTenantAuthority }] =
    await Promise.all([
      import('../src/tenant-authority-context'),
      import('../src/testing/tenant-authority'),
      import('../src/tenant-authority'),
    ]);
  const authorityFor = (tenantId: string): TenantAuthority => mintTestTenantAuthority(tenantId);
  const messageTenants = (tx: TenantTransaction) =>
    tx
      .select({ tenantId: claimMessages.tenantId })
      .from(claimMessages)
      .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]));
  const adminMessage = async (id: string) =>
    (await adminDb.select().from(claimMessages).where(eq(claimMessages.id, id)))[0];
  try {
    await t.test('runs as the restricted role with GUCs taken from the descriptor', async () => {
      const [row] = await withTenantAuthority(authorityFor(KS_TENANT_ID), tx =>
        tx.execute<{ currentUser: string; bypass: boolean; tenant: string; access: string }>(sql`
          select current_user as "currentUser", r.rolbypassrls as bypass,
            current_setting('app.current_tenant_id', true) as tenant,
            current_setting('app.current_access_tenant_id', true) as access
          from pg_roles r where r.rolname = current_user`)
      );
      assert.deepEqual(row, {
        currentUser: TEST_DB_ROLE,
        bypass: false,
        tenant: KS_TENANT_ID,
        access: KS_TENANT_ID,
      });
    });

    await t.test(
      'overlapping authorities never observe each other and reset on release',
      async () => {
        const observed: Observation[] = [];
        const outcomes = await Promise.all(
          Array.from({ length: CONTEXTS }, (_, index) => {
            const expected = index % 2 ? MK_TENANT_ID : KS_TENANT_ID;
            return withTenantAuthority(authorityFor(expected), async tx => {
              const [gucs] = await tx.execute<{ pid: number; tenant: string; access: string }>(sql`
              select pg_backend_pid() as pid,
                current_setting('app.current_tenant_id', true) as tenant,
                current_setting('app.current_access_tenant_id', true) as access`);
              await tx.execute(sql`select pg_sleep(0.05)`);
              const rows = await messageTenants(tx);
              observed.push({
                index,
                pid: gucs?.pid,
                expected,
                gucs: gucs && { tenant: gucs.tenant, access: gucs.access },
                seen: rows.map(r => r.tenantId),
              });
              // Every third transaction aborts after reading, so rollbacks share the pool too.
              if (index % 3 === 2) throw new DeliberateAbort();
              return 'committed' as const;
            }).catch((error: unknown) => {
              if (error instanceof DeliberateAbort) return 'aborted' as const;
              throw error;
            });
          })
        );
        assert.equal(outcomes.filter(outcome => outcome === 'aborted').length, CONTEXTS / 3);
        assert.equal(
          observed.length,
          CONTEXTS,
          'every transaction, committed or aborted, reported'
        );
        for (const row of observed) {
          const gucs = { tenant: row.expected, access: row.expected };
          assert.deepEqual(row, { ...row, gucs, seen: [row.expected] });
        }
        const pids = new Set(observed.map(row => row.pid));
        assert.ok(pids.size > 1, 'transactions overlapped on more than one connection');
        assert.ok(pids.size <= POOL_SIZE, 'the pinned pool forced connection reuse');

        const released = await Promise.all(
          Array.from({ length: CONTEXTS }, async () => {
            const [row] = await dbRls.execute<{ pid: number; tenant: string | null }>(sql`
            select pg_backend_pid() as pid,
              nullif(current_setting('app.current_access_tenant_id', true), '') as tenant`);
            return row;
          })
        );
        assert.ok(
          released.some(row => row && pids.has(row.pid)),
          'a reused connection was probed'
        );
        assert.deepEqual(
          released.map(row => row?.tenant ?? null),
          released.map(() => null)
        );
      }
    );

    await t.test('an expired or foreign-tenant authority changes nothing', async () => {
      let opened = false;
      const expired = mintTenantAuthority(
        { tenantId: KS_TENANT_ID, purpose: 'test' },
        Date.now() - TEST_LIFETIME_MS - 1_000
      );
      await assert.rejects(
        withTenantAuthority(expired, async () => {
          opened = true;
        }),
        /Expired tenant authority/u
      );
      assert.equal(opened, false, 'an expired authority never opens a transaction');

      const changed = await withTenantAuthority(authorityFor(MK_TENANT_ID), tx =>
        tx
          .update(claimMessages)
          .set({ content: 'tampered' })
          .where(eq(claimMessages.id, ks.messageId))
          .returning({ id: claimMessages.id })
      );
      assert.deepEqual(changed, []);
      assert.equal((await adminMessage(ks.messageId))?.content, `original ${KS_TENANT_ID}`);
    });

    await t.test('a failed authority transaction rolls back every write', async () => {
      const messageId = fixture.newId('s8rls_authority_rolled_back');
      fixture.extraMessageIds.push(messageId);
      await assert.rejects(
        withTenantAuthority(authorityFor(KS_TENANT_ID), async tx => {
          await tx.insert(claimMessages).values({
            id: messageId,
            tenantId: KS_TENANT_ID,
            claimId: ks.claimId,
            senderId: ks.userId,
            content: 'rolled back',
          });
          const updated = await tx
            .update(claimMessages)
            .set({ content: 'rolled back' })
            .where(eq(claimMessages.id, ks.messageId))
            .returning({ content: claimMessages.content });
          assert.deepEqual(updated, [{ content: 'rolled back' }], 'applied in-transaction');
          throw new Error('abort after writes');
        }),
        /abort after writes/u
      );
      assert.equal(await adminMessage(messageId), undefined);
      assert.equal((await adminMessage(ks.messageId))?.content, `original ${KS_TENANT_ID}`);
    });
  } finally {
    await session.close();
  }
});
