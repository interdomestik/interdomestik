import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  claimMessages,
  claimResponseRequests,
  notificationDeliveries,
  notifications,
  user,
} from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import { gate, waitForClaimLock, withStatusFixture } from './wp11-claim-status-rls.fixture';

test(
  'public staff answers and member requests follow the claim lock order under RLS',
  { timeout: 30_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const [{ sendMessageDbCore }, responseRequests, { buildStaffClaimReadScope }] =
        await Promise.all([
          import('../../domain-communications/src/messages/send'),
          import('../../domain-claims/src/claims/response-requests'),
          import('../../domain-claims/src/staff-claims/scope'),
        ]);
      const { adminDb, ownerId, staffId } = fixture;
      await adminDb.update(user).set({ role: 'member' }).where(eq(user.id, ownerId));
      const claimIds: string[] = [];

      try {
        for (const firstRole of ['member', 'staff'] as const) {
          await t.test(`${firstRole} takes the claim lock first`, async subtest => {
            const claimId = await fixture.newClaim('submitted', staffId);
            claimIds.push(claimId);
            const firstWrote = gate();
            const release = gate();
            let holderPid = 0;
            async function holdAfterWrite(tx: TenantTransaction) {
              const [backend] = await tx.execute<{ pid: number }>(
                sql`select pg_backend_pid() as pid`
              );
              holderPid = backend.pid;
              firstWrote.open();
              await release.promise;
            }
            const send = (role: 'staff' | 'member') => {
              const id = role === 'staff' ? staffId : ownerId;
              return sendMessageDbCore({
                claimId,
                authority: mintTestTenantAuthority(KS_TENANT_ID, { userId: id, role }),
                session: { user: { id, role, tenantId: KS_TENANT_ID } },
                requestHeaders: new Headers(),
                content: role === 'staff' ? 'Public staff answer' : 'Additional member question',
                claimEffects: {
                  buildStaffClaimScope: buildStaffClaimReadScope,
                  async createClaimResponseRequest(tx, input) {
                    await responseRequests.createClaimResponseRequest(tx, input);
                    if (firstRole === 'member') await holdAfterWrite(tx);
                  },
                  async answerClaimResponseRequests(tx, input) {
                    await responseRequests.answerClaimResponseRequests(tx, input);
                    if (firstRole === 'staff') await holdAfterWrite(tx);
                  },
                },
              });
            };
            const first = send(firstRole);
            let second: ReturnType<typeof send> | undefined;
            let firstResult: Awaited<typeof first>;
            let secondResult: Awaited<typeof first>;
            try {
              await Promise.race([
                firstWrote.promise,
                first.then(result =>
                  assert.fail(
                    `First send finished before holding the lock: ${JSON.stringify(result)}`
                  )
                ),
              ]);
              second = send(firstRole === 'member' ? 'staff' : 'member');
              await Promise.race([
                waitForClaimLock(fixture, holderPid, subtest.signal),
                second.then(() =>
                  assert.fail('Second send finished while the first held the lock')
                ),
              ]);
              release.open();
              [firstResult, secondResult] = await Promise.all([first, second]);
            } finally {
              release.open();
              await Promise.allSettled(second ? [first, second] : [first]);
            }
            assert.ok(firstResult.success);
            assert.ok(secondResult.success);
            const [member, staff] =
              firstRole === 'member' ? [firstResult, secondResult] : [secondResult, firstResult];
            const requests = await adminDb
              .select()
              .from(claimResponseRequests)
              .where(
                and(
                  eq(claimResponseRequests.tenantId, KS_TENANT_ID),
                  eq(claimResponseRequests.claimId, claimId)
                )
              );
            const messageRequest = requests.find(row => row.kind === 'member_message');
            const submittedRequest = requests.find(row => row.kind === 'claim_submitted');
            assert.ok(messageRequest);
            assert.equal(messageRequest.sourceMessageId, member.message.id);
            assert.equal(submittedRequest?.answerMessageId, staff.message.id);
            assert.equal(submittedRequest?.answeredBy, staffId);
            if (firstRole === 'member') {
              assert.equal(messageRequest?.answerMessageId, staff.message.id);
              assert.equal(messageRequest?.answeredBy, staffId);
              assert.ok(
                messageRequest?.answeredAt &&
                  messageRequest.answeredAt >= messageRequest.requestedAt
              );
              assert.deepEqual(messageRequest.answeredAt, submittedRequest?.answeredAt);
            } else {
              assert.equal(messageRequest?.answeredAt, null);
              assert.ok(
                submittedRequest?.answeredAt &&
                  submittedRequest.answeredAt <= messageRequest.requestedAt
              );
            }
          });
        }
      } finally {
        if (claimIds.length) {
          // Remove rows referencing fixture messages before deleting the messages.
          await adminDb
            .delete(claimResponseRequests)
            .where(inArray(claimResponseRequests.claimId, claimIds));
          await adminDb
            .delete(notificationDeliveries)
            .where(inArray(notificationDeliveries.claimId, claimIds));
          await adminDb.delete(claimMessages).where(inArray(claimMessages.claimId, claimIds));
          await adminDb.delete(notifications).where(
            and(
              eq(notifications.userId, staffId),
              inArray(
                notifications.actionUrl,
                claimIds.map(claimId => `/staff/claims/${claimId}`)
              )
            )
          );
        }
      }
    });
  }
);
