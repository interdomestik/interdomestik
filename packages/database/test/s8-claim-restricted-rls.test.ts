import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimMessages, claims, claimThreads } from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import { TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

const RLS_VIOLATION = '42501';
function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } }).cause;
  return cause?.code ?? (error as { code?: string }).code;
}

// Plan070 U2-b: restricted-login SQL proof on the S8 claim tables. The connection is a LOGIN
// role without BYPASSRLS, so every case below is decided by the policies, not by the client.
test('S8 claim tables confine a restricted LOGIN role to its access tenant', async t => {
  const session = await openS8RestrictedSession(t);
  if (!session) return;
  const { adminDb, fixture, dbRls, withTenantContext } = session;
  const { ks, mk } = fixture;
  try {
    const asTenant = <T>(tenantId: string, action: (tx: TenantTransaction) => Promise<T>) =>
      withTenantContext({ tenantId }, action);
    const idsIn = async (tx: TenantTransaction) => ({
      claims: (
        await tx
          .select({ id: claims.id })
          .from(claims)
          .where(inArray(claims.id, [ks.claimId, mk.claimId]))
      ).map(row => row.id),
      threads: (
        await tx
          .select({ id: claimThreads.id })
          .from(claimThreads)
          .where(inArray(claimThreads.id, [ks.threadId, mk.threadId]))
      ).map(row => row.id),
      messages: (
        await tx
          .select({ id: claimMessages.id })
          .from(claimMessages)
          .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]))
      ).map(row => row.id),
    });
    const withGucs = (gucs: Record<string, string>) =>
      dbRls.transaction(async tx => {
        for (const [name, value] of Object.entries(gucs)) {
          await tx.execute(sql`select set_config(${name}, ${value}, true)`);
        }
        return idsIn(tx);
      });
    const adminMessage = async (id: string) =>
      (await adminDb.select().from(claimMessages).where(eq(claimMessages.id, id)))[0];
    const rejectsWithCheck = async (attempts: (() => Promise<unknown>)[]) => {
      for (const [index, attempt] of attempts.entries()) {
        await assert.rejects(attempt, error => {
          assert.equal(pgCode(error), RLS_VIOLATION, `attempt ${index} must hit WITH CHECK`);
          return true;
        });
      }
    };

    await t.test('runs as the restricted login role with row security on', async () => {
      const [posture] = await asTenant(KS_TENANT_ID, tx =>
        tx.execute<{ currentUser: string; bypass: boolean; superuser: boolean }>(sql`
          select current_user as "currentUser", rolbypassrls as bypass, rolsuper as superuser
          from pg_roles where rolname = current_user`)
      );
      assert.deepEqual(posture, { currentUser: TEST_DB_ROLE, bypass: false, superuser: false });
    });

    await t.test('own tenant reads its claim, thread and message', async () => {
      assert.deepEqual(await asTenant(KS_TENANT_ID, idsIn), {
        claims: [ks.claimId],
        threads: [ks.threadId],
        messages: [ks.messageId],
      });
    });

    await t.test('foreign tenant can neither read nor change another tenant rows', async () => {
      assert.deepEqual(await asTenant(MK_TENANT_ID, idsIn), {
        claims: [mk.claimId],
        threads: [mk.threadId],
        messages: [mk.messageId],
      });
      const changed = await asTenant(MK_TENANT_ID, async tx => ({
        updated: await tx
          .update(claimMessages)
          .set({ content: 'tampered' })
          .where(eq(claimMessages.id, ks.messageId))
          .returning({ id: claimMessages.id }),
        deleted: await tx
          .delete(claimThreads)
          .where(eq(claimThreads.id, ks.threadId))
          .returning({ id: claimThreads.id }),
      }));
      assert.deepEqual(changed, { updated: [], deleted: [] });
      assert.equal((await adminMessage(ks.messageId))?.content, `original ${KS_TENANT_ID}`);
    });

    await t.test('an unset tenant context sees and changes nothing', async () => {
      const rows = await dbRls.transaction(async tx => ({
        ...(await idsIn(tx)),
        updated: await tx
          .update(claimMessages)
          .set({ content: 'tampered' })
          .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]))
          .returning({ id: claimMessages.id }),
      }));
      assert.deepEqual(rows, { claims: [], threads: [], messages: [], updated: [] });
    });

    // Policies key on the access tenant only; user identity is not a policy input here.
    await t.test('the owner-tenant GUC never selects rows; the access GUC does', async () => {
      assert.deepEqual(await withGucs({ 'app.current_tenant_id': KS_TENANT_ID }), {
        claims: [],
        threads: [],
        messages: [],
      });
      const conflicting = {
        'app.current_tenant_id': KS_TENANT_ID,
        'app.current_access_tenant_id': MK_TENANT_ID,
      };
      assert.deepEqual(await withGucs(conflicting), {
        claims: [mk.claimId],
        threads: [mk.threadId],
        messages: [mk.messageId],
      });
    });

    await t.test(
      'a delegated claim is readable by the access tenant but owner-writable',
      async () => {
        const delegated = eq(claims.id, fixture.delegatedClaimId);
        const mkView = await asTenant(MK_TENANT_ID, async tx => ({
          read: await tx.select({ id: claims.id }).from(claims).where(delegated),
          updated: await tx
            .update(claims)
            .set({ title: 'tampered' })
            .where(delegated)
            .returning({ id: claims.id }),
        }));
        assert.deepEqual(mkView, { read: [{ id: fixture.delegatedClaimId }], updated: [] });
      }
    );

    await t.test('WITH CHECK rejects inserting or moving rows into another tenant', async () => {
      const threadId = fixture.newId('s8rls_thread_forged');
      const messageId = fixture.newId('s8rls_message_forged');
      fixture.extraThreadIds.push(threadId);
      fixture.extraMessageIds.push(messageId);
      await rejectsWithCheck([
        () =>
          asTenant(KS_TENANT_ID, tx =>
            tx.insert(claimThreads).values({
              id: threadId,
              tenantId: MK_TENANT_ID,
              claimId: mk.claimId,
              subject: 'forged',
              createdBy: ks.userId,
            })
          ),
        () =>
          asTenant(KS_TENANT_ID, tx =>
            tx.insert(claimMessages).values({
              id: messageId,
              tenantId: MK_TENANT_ID,
              claimId: mk.claimId,
              senderId: ks.userId,
              content: 'forged',
            })
          ),
        () =>
          asTenant(KS_TENANT_ID, tx =>
            tx
              .update(claimMessages)
              .set({ tenantId: MK_TENANT_ID })
              .where(eq(claimMessages.id, ks.messageId))
          ),
        () =>
          asTenant(KS_TENANT_ID, tx =>
            tx.update(claims).set({ tenantId: MK_TENANT_ID }).where(eq(claims.id, ks.claimId))
          ),
        // The moved row stays SELECT-visible to KS through access_tenant_id, so only the write
        // policy's WITH CHECK can reject it.
        () =>
          asTenant(KS_TENANT_ID, tx =>
            tx
              .update(claims)
              .set({ tenantId: MK_TENANT_ID, accessTenantId: KS_TENANT_ID })
              .where(eq(claims.id, ks.claimId))
          ),
      ]);
      assert.equal((await adminMessage(ks.messageId))?.tenantId, KS_TENANT_ID);
      assert.equal(await adminMessage(messageId), undefined);
      const [claim] = await adminDb.select().from(claims).where(eq(claims.id, ks.claimId));
      assert.deepEqual([claim?.tenantId, claim?.accessTenantId], [KS_TENANT_ID, null]);
    });

    const reparentGap = {
      todo: 'claim_id references claim(id) only; needs a (tenant_id, claim_id) key (owner decision)',
    };
    await t.test('reparenting a message onto a foreign-tenant claim is rejected', reparentGap, () =>
      assert.rejects(
        asTenant(KS_TENANT_ID, tx =>
          tx
            .update(claimMessages)
            .set({ claimId: mk.claimId })
            .where(eq(claimMessages.id, ks.messageId))
        )
      )
    );
    await t.test('reparenting a thread onto a foreign-tenant claim is rejected', reparentGap, () =>
      assert.rejects(
        asTenant(KS_TENANT_ID, tx =>
          tx
            .update(claimThreads)
            .set({ claimId: mk.claimId })
            .where(eq(claimThreads.id, ks.threadId))
        )
      )
    );
  } finally {
    await session.close();
  }
});
