import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activateCurrentProof,
  activateReplacementProof,
  confirmReplacementProof,
  discardProof,
  reserveCurrentProof,
  reserveReplacementProof,
} from './different-email-recovery-store';
import * as support from './different-email-recovery-store.contract-test-support';
const now = new Date('2026-08-07T12:00:00.000Z'),
  nonce = () => crypto.randomUUID();
afterEach(support.cleanupRecoveryRows);
afterAll(() => support.recoverySql.end());
describe.runIf(process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT === '1')(
  'IDA-UI03b real PostgreSQL recovery store',
  () => {
    beforeEach(async () => {
      // Ensure the fixture tenant exists before opening its switch.
      await support.createRecoveryOwner('intake');
      return support.openRecoveryContractIntake();
    });

    it('restores an existing open switch as a JSON object with its original revision', async () => {
      const original = { enabled: true, revision: 7 };
      await support.recoverySql`
        update tenant_settings set value = ${JSON.stringify(original)}::text::jsonb
        where tenant_id = ${support.recoveryTenant} and category = 'pilot' and key = 'public_intake'
      `;
      const restore = await support.openRecoveryContractIntake();
      await restore();

      const [restored] = await support.recoverySql<{ value: unknown }[]>`
        select value from tenant_settings
        where tenant_id = ${support.recoveryTenant} and category = 'pilot' and key = 'public_intake'
      `;
      expect(restored?.value).toEqual(original);
    });

    it('preserves a committed proof on preflight drift and disables superseded reservations', async () => {
      const owner = await support.createRecoveryOwner('reservation');
      const first = nonce();
      expect(
        await reserveCurrentProof({
          currentEmail: owner.email,
          digest: 'current-a',
          nonce: first,
          now,
          userId: owner.id,
        })
      ).toEqual({ ok: true });
      expect(await activateCurrentProof(owner.id, first, owner.email, now)).toBe(true);
      expect(
        await reserveCurrentProof({
          currentEmail: 'drift@example.com',
          digest: 'current-drift',
          nonce: nonce(),
          now,
          userId: owner.id,
        })
      ).toEqual({ ok: false });
      expect(JSON.parse((await support.challengeRows(owner.id))[0]!.value).active).toBe(true);
      const second = nonce();
      await reserveCurrentProof({
        currentEmail: owner.email,
        digest: 'current-b',
        nonce: second,
        now,
        userId: owner.id,
      });
      expect(await activateCurrentProof(owner.id, first, owner.email, now)).toBe(false);
      expect(await activateCurrentProof(owner.id, second, owner.email, now)).toBe(true);
      await discardProof(owner.id, 'current', second);
      expect(await support.challengeRows(owner.id)).toHaveLength(0);
    });
    it('rotates stages, exhausts three attempts and rejects replay', async () => {
      const owner = await support.createRecoveryOwner('attempts');
      const current = nonce();
      await reserveCurrentProof({
        currentEmail: owner.email,
        digest: 'current-ok',
        nonce: current,
        now,
        userId: owner.id,
      });
      await activateCurrentProof(owner.id, current, owner.email, now);
      const replacement = nonce();
      expect(
        await reserveReplacementProof({
          currentDigest: 'current-ok',
          newEmail: `new-${owner.email}`,
          nonce: replacement,
          now,
          replacementDigest: 'replacement-ok',
          userId: owner.id,
        })
      ).toEqual({ ok: true });
      expect(await activateReplacementProof(owner.id, replacement, now)).toBe(true);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(
          await confirmReplacementProof(owner.id, support.recoveryTenant, () => 'wrong', now)
        ).toEqual({ ok: false });
      }
      expect(await support.challengeRows(owner.id)).toHaveLength(0);
      expect(
        await confirmReplacementProof(owner.id, support.recoveryTenant, () => 'replacement-ok', now)
      ).toEqual({
        ok: false,
      });
    });
    it('contains mixed-case collision and lets exactly one concurrent CAS win', async () => {
      const owner = await support.createRecoveryOwner('cas');
      const collision = `Collision-${crypto.randomUUID()}@Example.com`;
      await support.createRecoveryOwner('collision', collision);
      const current = nonce();
      await reserveCurrentProof({
        currentEmail: owner.email,
        digest: 'c1',
        nonce: current,
        now,
        userId: owner.id,
      });
      await activateCurrentProof(owner.id, current, owner.email, now);
      expect(
        await reserveReplacementProof({
          currentDigest: 'c1',
          newEmail: collision.toLowerCase(),
          nonce: nonce(),
          now,
          replacementDigest: 'r1',
          userId: owner.id,
        })
      ).toEqual({ ok: false });
      expect(await support.challengeRows(owner.id)).toHaveLength(0);
      const nextCurrent = nonce(),
        replacement = nonce(),
        target = `next-${owner.email}`;
      await reserveCurrentProof({
        currentEmail: owner.email,
        digest: 'c2',
        nonce: nextCurrent,
        now,
        userId: owner.id,
      });
      await activateCurrentProof(owner.id, nextCurrent, owner.email, now);
      await reserveReplacementProof({
        currentDigest: 'c2',
        newEmail: target,
        nonce: replacement,
        now,
        replacementDigest: 'r2',
        userId: owner.id,
      });
      await activateReplacementProof(owner.id, replacement, now);
      const results = await Promise.all([
        confirmReplacementProof(owner.id, support.recoveryTenant, () => 'r2', now),
        confirmReplacementProof(owner.id, support.recoveryTenant, () => 'r2', now),
      ]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(await support.ownerSnapshot(owner.id)).toEqual({
        email: target,
        emailVerified: true,
        id: owner.id,
        role: 'user',
        tenantId: 'tenant_ks',
      });
      expect(await support.challengeRows(owner.id)).toHaveLength(0);
    });
    it(
      'preserves the owner graph and serializes a concurrent identity writer',
      support.proveOwnerGraphAndConcurrentWriter
    );
  }
);
