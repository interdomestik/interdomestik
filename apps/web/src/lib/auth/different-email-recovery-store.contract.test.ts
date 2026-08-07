import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  activateCurrentProof,
  activateReplacementProof,
  confirmReplacementProof,
  discardProof,
  reserveCurrentProof,
  reserveReplacementProof,
} from './different-email-recovery-store';
import {
  challengeRows,
  cleanupRecoveryRows,
  createRecoveryOwner,
  ownerSnapshot,
  recoverySql,
} from './different-email-recovery-store.contract-test-support';
const now = new Date('2026-08-07T12:00:00.000Z'),
  nonce = () => crypto.randomUUID();
afterEach(cleanupRecoveryRows);
afterAll(() => recoverySql.end());
describe.runIf(process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT === '1')(
  'IDA-UI03b real PostgreSQL recovery store',
  () => {
    it('preserves a committed proof on preflight drift and disables superseded reservations', async () => {
      const owner = await createRecoveryOwner('reservation');
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
      expect(JSON.parse((await challengeRows(owner.id))[0]!.value).active).toBe(true);
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
      expect(await challengeRows(owner.id)).toHaveLength(0);
    });
    it('rotates stages, exhausts three attempts and rejects replay', async () => {
      const owner = await createRecoveryOwner('attempts');
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
        expect(await confirmReplacementProof(owner.id, () => 'wrong', now)).toEqual({ ok: false });
      }
      expect(await challengeRows(owner.id)).toHaveLength(0);
      expect(await confirmReplacementProof(owner.id, () => 'replacement-ok', now)).toEqual({
        ok: false,
      });
    });
    it('contains mixed-case collision and lets exactly one concurrent CAS win', async () => {
      const owner = await createRecoveryOwner('cas');
      const collision = `Collision-${crypto.randomUUID()}@Example.com`;
      await createRecoveryOwner('collision', collision);
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
      expect(await challengeRows(owner.id)).toHaveLength(0);
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
        confirmReplacementProof(owner.id, () => 'r2', now),
        confirmReplacementProof(owner.id, () => 'r2', now),
      ]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(await ownerSnapshot(owner.id)).toEqual({
        email: target,
        emailVerified: true,
        id: owner.id,
        role: 'user',
        tenantId: 'tenant_ks',
      });
      expect(await challengeRows(owner.id)).toHaveLength(0);
    });
  }
);
