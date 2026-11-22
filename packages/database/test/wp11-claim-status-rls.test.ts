import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import type { ClaimStatus } from '../src/constants';
import {
  auditLog,
  claimEscalationAgreements,
  claimResponseRequests,
  claims,
  claimStageHistory,
  domainEvents,
  notificationDeliveries,
} from '../src/schema';
import { KS_TENANT_ID } from './s8-claim-restricted-rls.fixture';
import { whileClaimWriterHoldsLock, withStatusFixture } from './wp11-claim-status-rls.fixture';

test(
  'WP-11 status writes serialize and preserve scoped effects under the restricted role',
  { timeout: 30_000 },
  async t => {
    await withStatusFixture(t, async fixture => {
      const [{ mintTestTenantAuthority }, { changeClaimStatus }] = await Promise.all([
        import('../src/testing/tenant-authority'),
        import('../../domain-claims/src/claims/change-status'),
      ]);
      const { adminDb, newClaim, ownerId, adminId, staffId, peerStaffId, newId } = fixture;
      const staff = mintTestTenantAuthority(KS_TENANT_ID, { userId: staffId, role: 'staff' });
      const admin = mintTestTenantAuthority(KS_TENANT_ID, {
        userId: adminId,
        role: 'tenant_admin',
      });
      const advance = (claimId: string, toStatus: ClaimStatus, authority = staff) =>
        changeClaimStatus(authority, { claimId, toStatus }, { hostId: null });

      await t.test(
        'two status changes see the committed lifecycle and write one set of effects',
        async subtest => {
          const claimId = await newClaim('submitted', staffId);
          const results = await whileClaimWriterHoldsLock(
            fixture,
            subtest.signal,
            tx =>
              tx
                .select({ id: claims.id })
                .from(claims)
                .where(eq(claims.id, claimId))
                .for('no key update'),
            () => Promise.all([advance(claimId, 'verification'), advance(claimId, 'verification')])
          );
          assert.equal(results.filter(result => result.ok && result.changed).length, 1);
          assert.equal(results.filter(result => result.ok && !result.changed).length, 1);
          const [claim] = await adminDb.select().from(claims).where(eq(claims.id, claimId));
          assert.equal(claim.lifecycleVersion, 1);
          const history = await adminDb
            .select()
            .from(claimStageHistory)
            .where(eq(claimStageHistory.claimId, claimId));
          assert.equal(history.length, 1);
          assert.equal(history[0].toStatus, 'verification');
          const events = await adminDb
            .select()
            .from(domainEvents)
            .where(eq(domainEvents.entityId, claimId));
          assert.equal(
            events.filter(event => event.eventName === 'claim.status_changed').length,
            1
          );
          const audits = await adminDb
            .select()
            .from(auditLog)
            .where(eq(auditLog.entityId, claimId));
          assert.equal(audits.filter(audit => audit.action === 'claim.status_changed').length, 1);
          const deliveries = await adminDb
            .select()
            .from(notificationDeliveries)
            .where(eq(notificationDeliveries.claimId, claimId));
          assert.equal(deliveries.length, 1);
          assert.equal(deliveries[0].recipientUserId, ownerId);
          const [request] = await adminDb
            .select()
            .from(claimResponseRequests)
            .where(eq(claimResponseRequests.claimId, claimId));
          assert.equal(request.answeredBy, staffId);
        }
      );

      await t.test('the staff scope is rechecked after a competing reassignment', async subtest => {
        const claimId = await newClaim('submitted', staffId);
        const result = await whileClaimWriterHoldsLock(
          fixture,
          subtest.signal,
          async tx => {
            await tx.update(claims).set({ staffId: peerStaffId }).where(eq(claims.id, claimId));
          },
          () => advance(claimId, 'verification')
        );
        assert.deepEqual(result, { ok: false, code: 'not_found' });
        assert.equal(
          (
            await adminDb
              .select()
              .from(claimStageHistory)
              .where(eq(claimStageHistory.claimId, claimId))
          ).length,
          0
        );
      });

      await t.test(
        'an admitted admin from a different home tenant answers the request',
        async () => {
          const claimId = await newClaim('submitted');
          const result = await advance(claimId, 'verification', admin);
          assert.ok(result.ok && result.changed);
          const [request] = await adminDb
            .select()
            .from(claimResponseRequests)
            .where(eq(claimResponseRequests.claimId, claimId));
          assert.equal(request.answeredBy, adminId);
          assert.ok(request.answeredAt);
        }
      );

      await t.test(
        'recovery waits for an agreement update and uses its committed terms',
        async subtest => {
          const claimId = await newClaim('evaluation', staffId);
          const agreementId = newId('wp11_agreement');
          await adminDb.insert(claimEscalationAgreements).values({
            id: agreementId,
            tenantId: KS_TENANT_ID,
            claimId,
            acceptedById: staffId,
            acceptedAt: new Date(),
            decisionType: 'accepted',
            decisionNextStatus: 'negotiation',
            signedAt: new Date(),
            legalActionCapPercentage: 25,
            feePercentage: 15,
            minimumFee: '10.00',
            termsVersion: 'v1',
            paymentAuthorizationState: 'authorized',
          });
          const result = await whileClaimWriterHoldsLock(
            fixture,
            subtest.signal,
            async tx => {
              await tx
                .update(claimEscalationAgreements)
                .set({ signedAt: null })
                .where(eq(claimEscalationAgreements.id, agreementId));
            },
            () => advance(claimId, 'negotiation')
          );
          assert.deepEqual(result, { ok: false, code: 'recovery_prerequisite:agreement' });
        }
      );
    });
  }
);
