import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { withDisposableClient } from '../src/disposable-client';
import {
  claimEscalationAgreements,
  claimRecoveryNoFeeEvidence,
  membershipPlans,
  serviceUsage,
  sponsorRosterEntries,
  sponsorTerms,
  subscriptions,
  user,
} from '../src/schema';
import { lockSponsorPerson } from '../src/sponsor-locks';
import type { TenantTransaction } from '../src/tenant';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import {
  seedRecoveryClaim,
  withSponsorStatusFixture,
  type SponsorStatusFixture,
  type SponsorStatusState,
} from './wp11-claim-recovery-coverage.fixture';
import {
  waitForClaimLock,
  whileClaimWriterHoldsLock,
  withStatusFixture,
  type StatusFixture,
  type StatusTestTransaction,
} from './wp11-claim-status-rls.fixture';

type Mutation = (tx: StatusTestTransaction) => Promise<void>;
type EntitlementCase = {
  label: string;
  initial: SponsorStatusState;
  write: (sponsor: SponsorStatusFixture) => Mutation;
  allowedWhenWriterFirst: boolean;
  deniedCode: string;
};

const covered = { bound: true, accepted: true };

function entitlementCases({ ownerId, staffId }: StatusFixture): EntitlementCase[] {
  const mutateEntry =
    (patch: Partial<typeof sponsorRosterEntries.$inferInsert>) =>
    ({ entryId }: SponsorStatusFixture): Mutation =>
    async tx => {
      await lockSponsorPerson(tx as unknown as TenantTransaction, ownerId);
      await tx.update(sponsorRosterEntries).set(patch).where(eq(sponsorRosterEntries.id, entryId));
    };
  const admission = {
    conflictDecision: 'accepted',
    conflictDecidedAt: new Date().toISOString(),
  } as const;
  return [
    {
      label: 'admission',
      initial: { bound: true, accepted: false },
      write: mutateEntry(admission),
      allowedWhenWriterFirst: true,
      deniedCode: 'recovery_prerequisite:membership',
    },
    {
      label: 'binding and admission',
      initial: { bound: false, accepted: false },
      write: mutateEntry({ ...admission, userId: ownerId }),
      allowedWhenWriterFirst: true,
      deniedCode: 'recovery_prerequisite:membership',
    },
    {
      label: 'term termination',
      initial: covered,
      write:
        ({ termId }) =>
        async tx => {
          const now = new Date().toISOString();
          await tx
            .update(sponsorTerms)
            .set({
              terminatedEffectiveAt: now,
              terminatedAt: now,
              terminatedBy: staffId,
            })
            .where(eq(sponsorTerms.id, termId));
        },
      allowedWhenWriterFirst: false,
      deniedCode: 'recovery_prerequisite:membership',
    },
    {
      label: 'revocation',
      initial: covered,
      write: mutateEntry({ revokedAt: new Date().toISOString(), revokedReason: 'staff' }),
      allowedWhenWriterFirst: false,
      deniedCode: 'recovery_prerequisite:membership',
    },
    {
      label: 'subscription plan downgrade',
      initial: {
        bound: true,
        accepted: false,
        subscription: { provider: 'paddle', planId: 'family', exhaustAllowance: true },
      },
      write:
        ({ subscriptionId }) =>
        async tx => {
          await tx
            .update(subscriptions)
            .set({ planId: 'standard' })
            .where(eq(subscriptions.id, subscriptionId));
        },
      allowedWhenWriterFirst: false,
      deniedCode: 'recovery_prerequisite:allowance',
    },
  ];
}

function assertOutcome(
  result: { ok: true; changed: boolean } | { ok: false; code: string },
  allowed: boolean,
  deniedCode: string
) {
  if (allowed) assert.ok(result.ok && result.changed);
  else assert.deepEqual(result, { ok: false, code: deniedCode });
}

const lockEvidence = (tx: StatusTestTransaction, evidenceId: string) =>
  tx
    .select({ id: claimRecoveryNoFeeEvidence.id })
    .from(claimRecoveryNoFeeEvidence)
    .where(eq(claimRecoveryNoFeeEvidence.id, evidenceId))
    .for('update');

async function writerWaitsForStatus<T>(
  fixture: StatusFixture,
  signal: AbortSignal,
  hold: Parameters<typeof whileClaimWriterHoldsLock>[2],
  status: () => Promise<T>,
  write: () => Promise<unknown>
): Promise<T> {
  let pendingWrite: Promise<unknown> | undefined;
  try {
    const outcome = await whileClaimWriterHoldsLock(
      fixture,
      signal,
      hold,
      status,
      async statusPid => {
        pendingWrite = write();
        await Promise.race([
          waitForClaimLock(fixture, statusPid, signal),
          pendingWrite.then(() =>
            assert.fail('The competing write finished while status still held the lock')
          ),
        ]);
      }
    );
    await pendingWrite;
    return outcome;
  } finally {
    if (pendingWrite) await Promise.allSettled([pendingWrite]);
  }
}

test(
  'WP-11 recovery and entitlement writers observe one committed coverage snapshot',
  { timeout: 45_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const [{ mintTestTenantAuthority }, { changeClaimStatus }] = await Promise.all([
        import('../src/testing/tenant-authority'),
        import('../../domain-claims/src/claims/change-status'),
      ]);
      const authority = mintTestTenantAuthority(KS_TENANT_ID, {
        userId: fixture.staffId,
        role: 'staff',
      });
      const recover = (claimId: string) =>
        changeClaimStatus(authority, { claimId, toStatus: 'negotiation' }, { hostId: null });
      const url = process.env.DATABASE_URL;
      assert.ok(url);

      await withDisposableClient(
        url,
        { applicationName: 'wp11_entitlement_writer' },
        async peer => {
          const writer = drizzle(peer);
          for (const scenario of entitlementCases(fixture)) {
            await t.test(`${scenario.label} first`, async subtest => {
              await withSponsorStatusFixture(fixture, scenario.initial, async sponsor => {
                const { claimId } = await seedRecoveryClaim(fixture);
                const outcome = await whileClaimWriterHoldsLock(
                  fixture,
                  subtest.signal,
                  scenario.write(sponsor),
                  () => recover(claimId)
                );
                assertOutcome(outcome, scenario.allowedWhenWriterFirst, scenario.deniedCode);
              });
            });

            await t.test(`status first, then ${scenario.label}`, async subtest => {
              await withSponsorStatusFixture(fixture, scenario.initial, async sponsor => {
                const { claimId, evidenceId } = await seedRecoveryClaim(fixture);
                // Pause at the user lock even when coverage is absent. For a plan write, pause at
                // evidence after subscription and plan locks.
                const hold = scenario.initial.subscription
                  ? (tx: StatusTestTransaction) => lockEvidence(tx, evidenceId)
                  : (tx: StatusTestTransaction) =>
                      tx
                        .select({ id: user.id })
                        .from(user)
                        .where(eq(user.id, fixture.ownerId))
                        .for('update');
                const outcome = await writerWaitsForStatus(
                  fixture,
                  subtest.signal,
                  hold,
                  () => recover(claimId),
                  () => writer.transaction(scenario.write(sponsor))
                );
                assertOutcome(outcome, !scenario.allowedWhenWriterFirst, scenario.deniedCode);
              });
            });
          }

          await t.test(
            'holds share locks on the agreement and applicable plan until commit',
            async subtest => {
              await withSponsorStatusFixture(fixture, covered, async sponsor => {
                const { claimId, evidenceId } = await seedRecoveryClaim(fixture);
                const outcome = await writerWaitsForStatus(
                  fixture,
                  subtest.signal,
                  tx => lockEvidence(tx, evidenceId),
                  () => recover(claimId),
                  () =>
                    writer
                      .update(membershipPlans)
                      .set({ name: 'Updated plan' })
                      .where(eq(membershipPlans.id, sponsor.planId))
                      .execute()
                );
                assert.ok(outcome.ok && outcome.changed);

                const agreement = await seedRecoveryClaim(fixture);
                const second = await writerWaitsForStatus(
                  fixture,
                  subtest.signal,
                  tx => lockEvidence(tx, agreement.evidenceId),
                  () => recover(agreement.claimId),
                  () =>
                    writer
                      .update(claimEscalationAgreements)
                      .set({ signedAt: null })
                      .where(eq(claimEscalationAgreements.id, agreement.agreementId))
                      .execute()
                );
                assert.ok(second.ok && second.changed);
              });
            }
          );
        }
      );

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
    });
  }
);
