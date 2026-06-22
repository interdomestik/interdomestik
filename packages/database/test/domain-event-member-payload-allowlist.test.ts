import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeResidenceChangedEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'member-1', role: 'member' },
    aggregateVersion: 0,
    correlationId: 'corr-1',
    entity: { id: 'member-1', type: 'member' },
    eventName: 'member.residence_country_changed',
    eventVersion: 1,
    id: 'event-1',
    payload: {
      activeRecoveryClaimCount: 0,
      activeRecoveryRunoff: false,
      changeState: 'pending_terms_reacceptance',
      dsrDecision: 'standard_dsr_with_erasure_render',
      fromResidenceCountry: 'DE',
      migrationDecision: 'defer_to_renewal',
      termsAcceptanceState: 'accepted_snapshot_present',
      termsAction: 'require_reacceptance_before_renewal',
      termsVersionAccepted: '2026-06-v1',
      toResidenceCountry: 'AT',
    },
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('appendEvent member residence-country payload allowlist', () => {
  for (const [name, payload, error] of [
    [
      'inline member email',
      { memberEmail: 'member@example.invalid' },
      /memberEmail is not allowlisted/,
    ],
    ['host inference', { host: 'at.example.test' }, /host is not allowlisted/],
    ['legal tenant inference', { legalTenantId: 'tenant-at' }, /legalTenantId is not allowlisted/],
    ['invalid destination country', { toResidenceCountry: 'AUT' }, /toResidenceCountry/],
    ['unsupported terms action', { termsAction: 'force_migration' }, /terms action/],
    ['negative recovery count', { activeRecoveryClaimCount: -1 }, /integer >= 0/],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();
      await assert.rejects(
        () =>
          appendEvent(
            tx,
            makeResidenceChangedEvent({
              payload: { ...makeResidenceChangedEvent().payload, ...payload },
            })
          ),
        error
      );
      assert.equal(capture.row, undefined);
    });
  }

  it('allows pending renewal residence-change evidence', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeResidenceChangedEvent());
    assert.deepEqual(capture.row?.payload, makeResidenceChangedEvent().payload);
  });

  it('allows active-recovery run-off evidence with missing terms snapshot', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(
      tx,
      makeResidenceChangedEvent({
        payload: {
          ...makeResidenceChangedEvent().payload,
          activeRecoveryClaimCount: 1,
          activeRecoveryRunoff: true,
          changeState: 'deferred_active_recovery_runoff',
          dsrDecision: 'legal_hold_run_off_until_recovery_terminal',
          migrationDecision: 'run_off_legacy_entity_until_recovery_terminal',
          termsAcceptanceState: 'missing_acceptance_snapshot',
          termsAction: 'defer_reacceptance_until_recovery_terminal',
          termsVersionAccepted: null,
        },
      })
    );
    assert.ok(capture.row);
    const payload = capture.row.payload as ReturnType<typeof makeResidenceChangedEvent>['payload'];
    assert.equal(payload.activeRecoveryRunoff, true);
    assert.equal(payload.termsVersionAccepted, null);
  });
});
