import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq, inArray, sql } from 'drizzle-orm';
import { claimEscalationAgreements, serviceUsage, subscriptions } from '../src/schema';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { KS_TENANT_ID, MK_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import {
  covered,
  lockEvidence,
  recoveryStatusCommand,
  seedRecoveryClaim,
  withSponsorStatusFixture,
} from './wp11-claim-recovery-coverage.fixture';
import { whileClaimWriterHoldsLock, withStatusFixture } from './wp11-claim-status-rls.fixture';

test(
  'WP-11 recovery usage and decisions under the restricted role',
  { timeout: 45_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const recover = await recoveryStatusCommand(fixture);
      await t.test(
        'usage uses the entitlement time even when coverage ends before the insert',
        async subtest => {
          const first = await seedRecoveryClaim(fixture);
          const second = await seedRecoveryClaim(fixture);
          const [clock] = await fixture.adminDb.execute<{ ms: number }>(sql`
        select (extract(epoch from clock_timestamp()) * 1000)::double precision as ms
      `);
          const boundary = new Date(clock.ms + 3500);
          await withSponsorStatusFixture(
            fixture,
            { ...covered, termEnd: boundary },
            async sponsor => {
              const outcome = await whileClaimWriterHoldsLock(
                fixture,
                subtest.signal,
                tx => lockEvidence(tx, first.evidenceId),
                () => recover(first.claimId),
                async () => {
                  const [remaining] = await fixture.dbRls.execute<{ ms: number }>(sql`
              select greatest(0, extract(epoch from (${boundary.toISOString()}::timestamptz - clock_timestamp())) * 1000)::double precision as ms
            `);
                  await sleep(Math.ceil(remaining.ms) + 10, undefined, { signal: subtest.signal });
                }
              );
              assert.ok(outcome.ok && outcome.changed);
              const [usage] = await fixture.adminDb
                .select()
                .from(serviceUsage)
                .where(eq(serviceUsage.subscriptionId, sponsor.subscriptionId));
              assert.equal(usage.serviceCode, `staff_recovery_matter:${first.claimId}`);
              assert.ok(usage.usedAt && usage.usedAt.getTime() < boundary.getTime());
              assert.deepEqual(await recover(second.claimId), {
                ok: false,
                code: 'recovery_prerequisite:membership',
              });
            }
          );
        }
      );

      await t.test(
        'an ordinary renewal delay cannot spend unused allowance from the expired period',
        async () => {
          const first = await seedRecoveryClaim(fixture);
          const second = await seedRecoveryClaim(fixture);
          await withSponsorStatusFixture(
            fixture,
            {
              bound: true,
              accepted: false,
              subscription: { provider: 'paddle', planId: 'family', exhaustAllowance: false },
            },
            async ({ subscriptionId }) => {
              const updatePeriod = (currentPeriodStart: Date, currentPeriodEnd: Date) =>
                fixture.adminDb
                  .update(subscriptions)
                  .set({ currentPeriodStart, currentPeriodEnd })
                  .where(eq(subscriptions.id, subscriptionId));
              const [clock] = await fixture.adminDb.execute<{ ms: number }>(sql`
          select (extract(epoch from clock_timestamp()) * 1000)::double precision as ms
        `);
              const expiredAt = new Date(clock.ms - 1_000);
              await updatePeriod(new Date(clock.ms - 86_400_000), expiredAt);
              const denied = { ok: false, code: 'recovery_prerequisite:allowance' };
              assert.deepEqual(await recover(first.claimId), denied);
              assert.deepEqual(await recover(second.claimId), denied);

              const readUsage = () =>
                fixture.adminDb
                  .select()
                  .from(serviceUsage)
                  .where(eq(serviceUsage.subscriptionId, subscriptionId));
              assert.deepEqual(await readUsage(), []);

              const renewedUntil = new Date(clock.ms + 86_400_000);
              await updatePeriod(expiredAt, renewedUntil);
              const result = await recover(first.claimId);
              assert.ok(result.ok && result.changed);
              const [usage] = await readUsage();
              assert.equal(usage?.serviceCode, `staff_recovery_matter:${first.claimId}`);
              assert.ok(usage?.usedAt && usage.usedAt >= expiredAt && usage.usedAt < renewedUntil);
            }
          );
        }
      );

      await t.test(
        'only a matching staff principal can save a scoped recovery decision',
        async () => {
          const { saveRecoveryDecisionCore } =
            await import('../../domain-claims/src/staff-claims/save-recovery-decision');
          const { adminDb, peerStaffId, staffId } = fixture;
          const claimId = await fixture.newClaim('evaluation', staffId);
          const outOfScopeClaimId = await fixture.newClaim('evaluation', peerStaffId);
          const staff = { userId: staffId, role: 'staff' };
          const authority = mintTestTenantAuthority(KS_TENANT_ID, staff);
          const base = {
            claimId,
            decisionType: 'accepted' as const,
            session: { user: { id: staffId, role: 'staff', tenantId: KS_TENANT_ID } },
          };
          for (const mismatched of [
            mintTestTenantAuthority(KS_TENANT_ID),
            mintTestTenantAuthority(KS_TENANT_ID, { ...staff, userId: peerStaffId }),
            mintTestTenantAuthority(MK_TENANT_ID, staff),
            mintTestTenantAuthority(KS_TENANT_ID, { ...staff, role: 'member' }),
          ]) {
            assert.deepEqual(await saveRecoveryDecisionCore({ ...base, authority: mismatched }), {
              success: false,
              error: 'Unauthorized',
            });
          }
          const injection = { ...base, authority, acceptedById: peerStaffId };
          assert.equal((await saveRecoveryDecisionCore(injection)).success, false);
          assert.deepEqual(
            await saveRecoveryDecisionCore({ ...base, claimId: outOfScopeClaimId, authority }),
            {
              success: false,
              error: 'Claim not found or access denied',
            }
          );
          const decisions = await adminDb
            .select()
            .from(claimEscalationAgreements)
            .where(inArray(claimEscalationAgreements.claimId, [claimId, outOfScopeClaimId]));
          assert.deepEqual(decisions, []);

          assert.equal((await saveRecoveryDecisionCore({ ...base, authority })).success, true);
          const [decision] = await adminDb
            .select()
            .from(claimEscalationAgreements)
            .where(eq(claimEscalationAgreements.claimId, claimId));
          assert.equal(decision?.acceptedById, staffId);
        }
      );
    });
  }
);
