import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import assert from 'node:assert/strict';
import {
  assertPage,
  documentId,
  type ClaimDetailReader,
  type ClaimReadFixture,
  type FixtureController,
} from './admin-claim-detail-plans';
import { observeRestrictedPool, type Pool, type RunSql } from './admin-claim-detail-query-probe';

type FixtureWriter = Parameters<Parameters<FixtureController['begin']>[1]>[0];

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
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

export async function assertRestrictedDocumentReads(
  f: ClaimReadFixture,
  controller: FixtureController,
  pool: Pool,
  read: ClaimDetailReader,
  {
    admin,
    manager,
    current,
  }: {
    admin: TenantAuthority;
    manager: TenantAuthority;
    current: TenantAuthority;
  }
) {
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
}
