import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInt, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  claimMessages,
  claimResponseRequests,
  notificationDeliveries,
  notifications,
  user,
} from '../src/schema';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import {
  waitForClaimLock,
  whileClaimWriterHoldsLock,
  withStatusFixture,
} from './wp11-claim-status-rls.fixture';

test(
  'public staff answers and member requests follow the claim lock order under RLS',
  { timeout: 30_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const { sendMessageDbCore } = await import('../../domain-claims/src/claims/send-message');
      const { adminDb, ownerId, staffId } = fixture;
      await adminDb.update(user).set({ role: 'member' }).where(eq(user.id, ownerId));
      const claimIds: string[] = [];

      try {
        for (const firstRole of ['member', 'staff'] as const) {
          await t.test(`${firstRole} takes the claim lock first`, async subtest => {
            const claimId = await fixture.newClaim('submitted', staffId);
            claimIds.push(claimId);
            const send = (role: 'staff' | 'member') => {
              const id = role === 'staff' ? staffId : ownerId;
              return sendMessageDbCore({
                claimId,
                authority: mintTestTenantAuthority(KS_TENANT_ID, { userId: id, role }),
                session: { user: { id, role, tenantId: KS_TENANT_ID } },
                requestHeaders: new Headers(),
                content: role === 'staff' ? 'Public staff answer' : 'Additional member question',
              });
            };
            // Block the first command after its real response-request write. The second
            // command must wait on that transaction's claim lock before touching its effects.
            const name = quoteIdentifier(`wp11_response_gate_${randomUUID().replaceAll('-', '')}`);
            const lockKey = randomInt(1, 2 ** 31);
            const sends: { second?: ReturnType<typeof send> } = {};
            await adminDb.execute(
              sql.raw(`
              create function public.${name}() returns trigger language plpgsql as $$
              begin
                perform pg_advisory_xact_lock(${lockKey}::bigint);
                return new;
              end;
              $$`)
            );
            let firstResult: Awaited<ReturnType<typeof send>>;
            try {
              await adminDb.execute(
                sql.raw(`
                create trigger ${name} after insert or update on public.claim_response_requests
                for each row when (new.claim_id = ${quoteSqlLiteral(claimId)})
                execute function public.${name}()`)
              );
              firstResult = await whileClaimWriterHoldsLock(
                fixture,
                subtest.signal,
                async tx => {
                  await tx.execute(sql`select pg_advisory_xact_lock(${lockKey}::bigint)`);
                },
                () => send(firstRole),
                async firstPid => {
                  sends.second = send(firstRole === 'member' ? 'staff' : 'member');
                  await Promise.race([
                    waitForClaimLock(fixture, firstPid, subtest.signal),
                    sends.second.then(() =>
                      assert.fail('Second send finished while the first held the claim lock')
                    ),
                  ]);
                }
              );
            } finally {
              if (sends.second) await Promise.allSettled([sends.second]);
              await adminDb.execute(
                sql.raw(`drop trigger if exists ${name} on public.claim_response_requests`)
              );
              await adminDb.execute(sql.raw(`drop function public.${name}()`));
            }
            assert.ok(sends.second);
            const secondResult = await sends.second;
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
