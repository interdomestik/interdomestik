import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimMessages, claims } from '../src/schema';
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
// A principal role per context, plus null for a principal-free (system) authority.
const PRINCIPAL_ROLES = ['staff', 'agent', 'admin', null] as const;

class DeliberateAbort extends Error {}

type Gucs = { pid: number; tenant: string | null; access: string | null; role: string | null };
type Observation = { expected: Omit<Gucs, 'pid'>; gucs?: Gucs; seen: string[] };

const GUC_PROBE = sql`
  select pg_backend_pid() as pid,
    nullif(current_setting('app.current_tenant_id', true), '') as tenant,
    nullif(current_setting('app.current_access_tenant_id', true), '') as access,
    nullif(current_setting('app.user_role', true), '') as role`;

const byText = (a: string, b: string): number => a.localeCompare(b);
const withoutPid = (row: Gucs | undefined): Omit<Gucs, 'pid'> | undefined =>
  row && { tenant: row.tenant, access: row.access, role: row.role };

// Plan070 §4: the isolation U2-b proves for withTenantContext, proved through the entry the
// application calls. Transactions below are opened by withTenantAuthority with registered tokens
// on the restricted LOGIN role, so the descriptor alone decides tenant, access tenant and role.
test('withTenantAuthority confines the restricted role under concurrency, expiry and rollback', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: String(POOL_SIZE) });
  if (!session) return;
  const { adminDb, fixture, dbRls } = session;
  const { ks, mk } = fixture;
  const messageTenants = async (tx: TenantTransaction) =>
    (
      await tx
        .select({ tenantId: claimMessages.tenantId })
        .from(claimMessages)
        .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]))
    ).map(row => row.tenantId);
  const gucsOf = async (tx: Pick<TenantTransaction, 'execute'>) =>
    (await tx.execute<Gucs>(GUC_PROBE))[0];
  const adminMessage = async (id: string) =>
    (await adminDb.select().from(claimMessages).where(eq(claimMessages.id, id)))[0];
  try {
    const [{ withTenantAuthority }, { mintTestTenantAuthority }, { mintTenantAuthority }] =
      await Promise.all([
        import('../src/tenant-authority-context'),
        import('../src/testing/tenant-authority'),
        import('../src/tenant-authority'),
      ]);
    const authorityFor = (tenantId: string, role: string | null): TenantAuthority =>
      role === null
        ? mintTestTenantAuthority(tenantId)
        : mintTestTenantAuthority(tenantId, { userId: ks.userId, role });

    await t.test('runs as the restricted role with row security not bypassable', async () => {
      const [row] = await withTenantAuthority(authorityFor(KS_TENANT_ID, 'staff'), tx =>
        tx.execute<{ currentUser: string; bypass: boolean }>(sql`
          select current_user as "currentUser", rolbypassrls as bypass
          from pg_roles where rolname = current_user`)
      );
      assert.deepEqual(row, { currentUser: TEST_DB_ROLE, bypass: false });
    });

    await t.test('owner and access tenants diverge exactly as the descriptor says', async () => {
      const delegated = mintTenantAuthority({
        tenantId: KS_TENANT_ID,
        accessTenantId: MK_TENANT_ID,
        purpose: 'test',
        principal: { userId: mk.userId, role: 'staff', branchId: null, agentId: null },
      });
      const claimIds = [ks.claimId, mk.claimId, fixture.delegatedClaimId];
      const view = await withTenantAuthority(delegated, async tx => {
        const gucs = withoutPid(await gucsOf(tx));
        const visible = await tx
          .select({ id: claims.id })
          .from(claims)
          .where(inArray(claims.id, claimIds));
        return {
          gucs,
          messages: await messageTenants(tx),
          claims: visible.map(row => row.id).sort(byText),
          updated: await tx
            .update(claims)
            .set({ title: 'tampered' })
            .where(inArray(claims.id, [ks.claimId, fixture.delegatedClaimId]))
            .returning({ id: claims.id }),
        };
      });
      assert.deepEqual(view, {
        gucs: { tenant: KS_TENANT_ID, access: MK_TENANT_ID, role: 'staff' },
        messages: [MK_TENANT_ID],
        claims: [mk.claimId, fixture.delegatedClaimId].sort(byText),
        updated: [],
      });
    });

    await t.test(
      'overlapping authorities never observe each other and reset on release',
      async () => {
        const observed: Observation[] = [];
        let active = 0;
        let maxActive = 0;
        const settled = await Promise.allSettled(
          Array.from({ length: CONTEXTS }, (_, index) => {
            const tenant = index % 2 ? MK_TENANT_ID : KS_TENANT_ID;
            const principalRole = PRINCIPAL_ROLES[index % PRINCIPAL_ROLES.length] ?? null;
            const expected = { tenant, access: tenant, role: principalRole ?? 'system' };
            return withTenantAuthority(authorityFor(tenant, principalRole), async tx => {
              const gucs = await gucsOf(tx);
              active += 1;
              maxActive = Math.max(maxActive, active);
              await tx.execute(sql`select pg_sleep(0.05)`);
              active -= 1;
              observed.push({ expected, gucs, seen: await messageTenants(tx) });
              // Every third transaction aborts after reading, so rollbacks share the pool too.
              if (index % 3 === 2) throw new DeliberateAbort();
            });
          })
        );
        const rejected = settled.flatMap(r => (r.status === 'rejected' ? [r.reason] : []));
        assert.deepEqual(
          rejected.filter(reason => !(reason instanceof DeliberateAbort)),
          [],
          'only the deliberate aborts rejected'
        );
        assert.equal(rejected.length, CONTEXTS / 3);
        assert.equal(
          observed.length,
          CONTEXTS,
          'every transaction, committed or aborted, reported'
        );
        assert.ok(maxActive > 1, 'transactions were inside the database at the same time');
        for (const row of observed) {
          assert.deepEqual(
            { gucs: withoutPid(row.gucs), seen: row.seen },
            { gucs: row.expected, seen: [row.expected.tenant] }
          );
        }
        const used = new Set(observed.map(row => row.gucs?.pid));
        assert.ok(used.size <= POOL_SIZE, 'the pinned pool forced connection reuse');

        // Each probe holds its connection, so concurrent probes cover every pooled backend.
        // allSettled drains every probe before asserting, so no transaction outlives this case.
        const probes = await Promise.allSettled(
          Array.from({ length: POOL_SIZE * 3 }, () =>
            dbRls.transaction(async tx => {
              const row = await gucsOf(tx);
              await tx.execute(sql`select pg_sleep(0.05)`);
              return row;
            })
          )
        );
        assert.deepEqual(
          probes.flatMap(probe => (probe.status === 'rejected' ? [probe.reason] : [])),
          [],
          'every reset probe completed'
        );
        const released = probes.map(probe =>
          probe.status === 'fulfilled' ? probe.value : undefined
        );
        assert.ok(released.every(Boolean), 'every probe returned a row');
        const probed = new Set(released.map(row => row?.pid));
        for (const pid of used)
          assert.ok(probed.has(pid), `backend ${pid} was probed after release`);
        for (const row of released) {
          assert.deepEqual(withoutPid(row), { tenant: null, access: null, role: null });
        }
      }
    );

    await t.test('an expired authority never opens a transaction', async () => {
      const original = dbRls.transaction;
      let entered = 0;
      dbRls.transaction = ((...args: Parameters<typeof original>) => {
        entered += 1;
        return original.apply(dbRls, args);
      }) as typeof original;
      try {
        await withTenantAuthority(authorityFor(KS_TENANT_ID, 'staff'), async () => undefined);
        assert.equal(entered, 1, 'positive control: a live authority enters one transaction');
        const expired = mintTenantAuthority(
          { tenantId: KS_TENANT_ID, purpose: 'test' },
          Date.now() - TEST_LIFETIME_MS - 1_000
        );
        await assert.rejects(
          withTenantAuthority(expired, async () => undefined),
          /Expired tenant authority/u
        );
        assert.equal(entered, 1, 'the expired authority was refused before any transaction');
      } finally {
        dbRls.transaction = original;
      }
    });

    await t.test('a foreign authority changes nothing and failures roll back', async () => {
      const changed = await withTenantAuthority(authorityFor(MK_TENANT_ID, 'staff'), tx =>
        tx
          .update(claimMessages)
          .set({ content: 'tampered' })
          .where(eq(claimMessages.id, ks.messageId))
          .returning({ id: claimMessages.id })
      );
      assert.deepEqual(changed, []);

      const messageId = fixture.newId('s8rls_authority_rolled_back');
      fixture.extraMessageIds.push(messageId);
      await assert.rejects(
        withTenantAuthority(authorityFor(KS_TENANT_ID, 'staff'), async tx => {
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
