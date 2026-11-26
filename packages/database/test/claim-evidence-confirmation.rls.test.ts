import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { claimInformationRequests, claims, user } from '../src/schema';
import {
  openEvidenceConfirmationFixture,
  type ProvisionerTx,
} from './claim-evidence-confirmation.fixture';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';

type Fixture = NonNullable<Awaited<ReturnType<typeof openEvidenceConfirmationFixture>>>;
type Input = Parameters<Fixture['confirm']>[0];
type Move = (tx: ProvisionerTx) => Promise<unknown>;

const noEffects = { documents: 0, consents: 0, links: 0, audits: 0, aiRuns: 0 };
const conflict = /Document upload conflicts|Information request changed/;

async function pid(tx: ProvisionerTx): Promise<number> {
  const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return row.pid;
}

async function changeCommitsFirst(f: Fixture, input: Input, move: Move) {
  const pending: Promise<unknown>[] = [];
  try {
    await f.peer.transaction(async tx => {
      await move(tx);
      const confirmation = assert.rejects(f.confirm(input), conflict);
      pending.push(confirmation);
      void confirmation.catch(() => undefined);
      await f.waitForWaiter(await pid(tx));
    });
    await Promise.all(pending);
  } finally {
    await Promise.allSettled(pending);
  }
  assert.deepEqual(await f.effects(input.fileId), noEffects);
}

async function confirmationCommitsFirst(f: Fixture, input: Input, move: Move) {
  const pending: Promise<unknown>[] = [];
  try {
    await f.adminDb.transaction(async holder => {
      // The upload FK waits on the uploader row after the confirmation has locked the claim.
      await holder
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.userId))
        .for('update');
      const confirmation = f.confirm(input);
      pending.push(confirmation);
      void confirmation.catch(() => undefined);
      const confirmationPid = await f.waitForWaiter(await pid(holder));

      const competingChange = f.peer.transaction(move);
      pending.push(competingChange);
      void competingChange.catch(() => undefined);
      await f.waitForWaiter(confirmationPid);
    });
    const [created] = await Promise.all(pending);
    assert.equal(created, true);
  } finally {
    await Promise.allSettled(pending);
  }

  await assert.rejects(f.confirm(input), conflict);
  assert.deepEqual(await f.effects(input.fileId), {
    ...noEffects,
    documents: 1,
    consents: input.aiExtractionConsent?.granted ? 1 : 0,
    links: input.informationRequestId ? 1 : 0,
    audits: input.informationRequestId ? 1 : 0,
  });
}

test('WP-19 evidence confirmation locks the authorized claim and request under restricted LOGIN', async t => {
  const f = await openEvidenceConfirmationFixture(t);
  if (!f) return;

  await t.test(
    'ordinary confirmation enforces the current actor, home tenant, role and staff branch',
    async () => {
      const claimId = await f.makeClaim({ staffId: null });
      const allowed = [
        ...['admin', 'tenant_admin', 'super_admin', 'member', 'user', 'agent'].map(role =>
          f.input(claimId, { role })
        ),
        f.input(claimId, { role: 'staff', branchId: f.branchId }),
        f.input(claimId, { role: 'staff' }),
      ];
      for (const input of allowed) {
        assert.equal(await f.confirm(input), true);
        assert.equal(await f.confirm(input), false);
        assert.deepEqual(await f.effects(input.fileId), {
          ...noEffects,
          documents: 1,
          consents: input.aiExtractionConsent?.granted ? 1 : 0,
        });
      }

      const denied = [
        f.input(claimId, { role: 'admin', actorId: f.mkUserId, tenantId: MK_TENANT_ID }),
        f.input(claimId, { role: 'agent', actorId: f.otherUserId }),
        f.input(claimId, { role: 'member', actorId: f.otherUserId }),
        f.input(claimId, { role: 'branch_manager' }),
        f.input(claimId, { role: 'staff', branchId: f.otherBranchId }),
      ];
      for (const input of denied) {
        await assert.rejects(f.confirm(input), conflict);
        assert.deepEqual(await f.effects(input.fileId), noEffects);
        assert.deepEqual(await f.effects(input.fileId, input.authority), noEffects);
      }

      const injected = {
        ...f.input(claimId, { role: 'member' }),
        userId: f.otherUserId,
        actorRole: 'admin',
      };
      await assert.rejects(f.confirm(injected), /trusted upload actor role/);
      assert.deepEqual(await f.effects(injected.fileId), noEffects);

      const assigned = await f.makeClaim({ staffId: f.otherUserId });
      const sameBranch = f.input(assigned, { role: 'staff', branchId: f.branchId });
      assert.equal(await f.confirm(sameBranch), true);
      const branchless = f.input(assigned, { role: 'staff' });
      await assert.rejects(f.confirm(branchless), conflict);
      assert.deepEqual(await f.effects(branchless.fileId), noEffects);
    }
  );

  for (const confirmFirst of [false, true]) {
    const race = confirmFirst ? confirmationCommitsFirst : changeCommitsFirst;
    const commitOrder = confirmFirst
      ? 'confirmation commits first'
      : 'the scope change commits first';

    await t.test(`effective access transfer when ${commitOrder}`, async () => {
      const claimId = await f.makeClaim();
      assert.deepEqual(await f.visibleClaim(claimId), [{ id: claimId }]);
      assert.deepEqual(await f.visibleClaim(claimId, f.successor), []);
      await race(f, f.input(claimId, { role: 'admin' }), tx =>
        tx.update(claims).set({ accessTenantId: MK_TENANT_ID }).where(eq(claims.id, claimId))
      );
      assert.deepEqual(await f.visibleClaim(claimId), []);
      assert.deepEqual(await f.visibleClaim(claimId, f.successor), [{ id: claimId }]);
      const retry = f.input(claimId, { role: 'admin' });
      await assert.rejects(f.confirm(retry), conflict);
      assert.deepEqual(await f.effects(retry.fileId), noEffects);
    });

    await t.test(`staff reassignment when ${commitOrder}`, async () => {
      const claimId = await f.makeClaim();
      await race(f, f.input(claimId, { role: 'staff', branchId: f.otherBranchId }), tx =>
        tx.update(claims).set({ staffId: f.otherUserId }).where(eq(claims.id, claimId))
      );
    });

    await t.test(`transition to draft when ${commitOrder}`, async () => {
      const claimId = await f.makeClaim();
      await race(f, f.input(claimId, { role: 'staff', branchId: f.branchId }), tx =>
        tx.update(claims).set(claimLifecycleFieldsForStatus('draft')).where(eq(claims.id, claimId))
      );
    });

    await t.test(`member ownership change when ${commitOrder}`, async () => {
      const claimId = await f.makeClaim();
      await race(f, f.input(claimId), tx =>
        tx.update(claims).set({ userId: f.otherUserId }).where(eq(claims.id, claimId))
      );
    });

    await t.test(`information request closure when ${commitOrder}`, async () => {
      const claimId = await f.makeClaim();
      const informationRequestId = await f.makeRequest(claimId);
      const original = f.input(claimId, { informationRequestId });
      assert.equal(await f.confirm(original), true);
      await race(f, f.input(claimId, { informationRequestId }), tx =>
        tx
          .update(claimInformationRequests)
          .set({
            status: 'fulfilled',
            fulfilledAt: new Date(),
            fulfilledByStaffId: f.otherUserId,
            fulfilledDocumentId: original.fileId,
          })
          .where(eq(claimInformationRequests.id, informationRequestId))
      );
    });
  }

  await t.test(
    'a failed dependent audit rolls back consent, metadata and request linkage',
    async () => {
      const claimId = await f.makeClaim();
      const informationRequestId = await f.makeRequest(claimId);
      const input = f.input(claimId, { informationRequestId });
      const role = quoteIdentifier(TEST_DB_ROLE);
      await f.adminDb.execute(sql.raw(`revoke insert on audit_log from ${role}`));
      try {
        await assert.rejects(f.confirm(input), (error: unknown) => {
          const cause = (error as { cause?: { code?: string; message?: string } }).cause;
          return cause?.code === '42501' && /audit_log/.test(cause.message ?? '');
        });
        assert.deepEqual(await f.effects(input.fileId), noEffects);
      } finally {
        await f.adminDb.execute(sql.raw(`grant insert on audit_log to ${role}`));
      }
      assert.equal(await f.confirm(input), true);
      assert.equal(await f.confirm(input), false);
      assert.deepEqual(await f.effects(input.fileId), {
        documents: 1,
        consents: 1,
        links: 1,
        audits: 1,
        aiRuns: 0,
      });
    }
  );
});
