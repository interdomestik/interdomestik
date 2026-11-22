import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq, sql } from 'drizzle-orm';
import { serviceUsage } from '../src/schema';
import {
  covered,
  lockEvidence,
  recoveryStatusCommand,
  seedRecoveryClaim,
  withSponsorStatusFixture,
} from './wp11-claim-recovery-coverage.fixture';
import { whileClaimWriterHoldsLock, withStatusFixture } from './wp11-claim-status-rls.fixture';

test(
  'usage uses the entitlement time even when coverage ends before the insert',
  { timeout: 45_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const recover = await recoveryStatusCommand(fixture);
      const first = await seedRecoveryClaim(fixture);
      const second = await seedRecoveryClaim(fixture);
      const [clock] = await fixture.adminDb.execute<{ ms: number }>(sql`
        select (extract(epoch from clock_timestamp()) * 1000)::double precision as ms
      `);
      const boundary = new Date(clock.ms + 3500);
      await withSponsorStatusFixture(fixture, { ...covered, termEnd: boundary }, async sponsor => {
        const outcome = await whileClaimWriterHoldsLock(
          fixture,
          t.signal,
          tx => lockEvidence(tx, first.evidenceId),
          () => recover(first.claimId),
          async () => {
            const [remaining] = await fixture.dbRls.execute<{ ms: number }>(sql`
              select greatest(0, extract(epoch from (${boundary.toISOString()}::timestamptz - clock_timestamp())) * 1000)::double precision as ms
            `);
            await sleep(Math.ceil(remaining.ms) + 10, undefined, { signal: t.signal });
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
      });
    });
  }
);
