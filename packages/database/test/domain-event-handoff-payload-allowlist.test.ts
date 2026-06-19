import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeHandoffEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'staff-1', role: 'staff' },
    aggregateVersion: 4,
    correlationId: 'handoff:corr-1',
    entity: { id: 'claim-1', type: 'recovery' },
    eventName: 'recovery.handed_off_to_jurisdiction',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      documentClasses: ['legal', 'evidence'],
      fromTenantId: 'tenant_ks',
      grantActorId: 'local-legal-1',
      grantExpiresAt: '2026-07-01T00:00:00.000Z',
      grantId: 'grant-1',
      grantIssued: true,
      grantReasonCode: 'incident_jurisdiction',
      incidentCountryCode: 'MK',
      recoveryLegalTenantId: 'tenant_mk',
    },
    tenantId: 'tenant_ks',
    ...overrides,
  };
}

describe('appendEvent handoff payload allowlist', () => {
  for (const [name, payload, error] of [
    ['member id', { memberId: 'member-1' }, /memberId is not allowlisted/],
    ['profile id', { profileId: 'profile-1' }, /profileId is not allowlisted/],
    ['membership id', { membershipId: 'membership-1' }, /membershipId is not allowlisted/],
    ['raw note', { note: 'member narrative' }, /note is not allowlisted/],
    ['medical class', { documentClasses: ['medical'] }, /approved handoff document class/],
    ['export class', { documentClasses: ['export'] }, /approved handoff document class/],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();
      await assert.rejects(
        () =>
          appendEvent(
            tx,
            makeHandoffEvent({
              payload: { ...makeHandoffEvent().payload, ...payload },
            })
          ),
        error
      );
      assert.equal(capture.row, undefined);
    });
  }

  it('allows only minimized handoff audit fields', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeHandoffEvent());

    assert.deepEqual(capture.row?.payload, makeHandoffEvent().payload);
  });

  for (const tenantId of ['tenant_ks', 'tenant-mk', 'pilot-mk'] as const) {
    it(`accepts configured tenant id ${tenantId}`, async () => {
      const { capture, tx } = makeEventTx();
      await appendEvent(
        tx,
        makeHandoffEvent({
          payload: {
            ...makeHandoffEvent().payload,
            fromTenantId: tenantId,
            recoveryLegalTenantId: tenantId,
          },
        })
      );

      assert.equal(capture.row?.payload.fromTenantId, tenantId);
      assert.equal(capture.row?.payload.recoveryLegalTenantId, tenantId);
    });
  }

  for (const tenantId of ['', ' tenant_ks ', 'pilot.mk', '../tenant_ks'] as const) {
    it(`rejects unsafe tenant id ${JSON.stringify(tenantId)}`, async () => {
      const { capture, tx } = makeEventTx();
      await assert.rejects(
        () =>
          appendEvent(
            tx,
            makeHandoffEvent({
              payload: { ...makeHandoffEvent().payload, fromTenantId: tenantId },
            })
          ),
        /tenant identifier/
      );
      assert.equal(capture.row, undefined);
    });
  }
});
