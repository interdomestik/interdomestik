import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent } from '../src/domain-events';
import { makeEventTx } from './domain-event-test-utils';

function makeEntityMigratedEvent(overrides: Partial<Parameters<typeof appendEvent>[1]> = {}) {
  return {
    actor: { id: 'ops-lead', role: 'system' },
    aggregateVersion: 1,
    correlationId: 'corr-t506',
    entity: { id: 'member-1', type: 'member' },
    eventName: 'membership.entity_migrated',
    eventVersion: 1,
    id: 'event-t506',
    payload: {
      activeRecoveryCaseCount: 0,
      approvalKind: 'human_approval',
      fromGoverningLaw: 'MK',
      fromLegalEntityId: 'le-old',
      fromLegalTenantId: 'tenant-home',
      fromTermsVersionAccepted: 'terms-2026-06',
      migrationMode: 'apply',
      termsAction: 'reissue_and_recapture',
      toGoverningLaw: 'DE',
      toLegalEntityId: 'le-de',
      toLegalTenantId: 'tenant-home',
      toTermsVersionAccepted: 'terms-2026-07',
    },
    tenantId: 'tenant-home',
    ...overrides,
  };
}

type EntityMigratedPayload = ReturnType<typeof makeEntityMigratedEvent>['payload'];

function assertEntityMigratedPayload(value: unknown): asserts value is EntityMigratedPayload {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  const payload = value as Record<string, unknown>;
  assert.equal(typeof payload.fromLegalEntityId, 'string');
  assert.equal(typeof payload.toLegalTenantId, 'string');
}

function capturedEntityMigratedPayload(
  capture: ReturnType<typeof makeEventTx>['capture']
): EntityMigratedPayload {
  const payload = capture.row?.payload;
  assertEntityMigratedPayload(payload);
  return payload;
}

describe('appendEvent membership.entity_migrated payload allowlist', () => {
  it('allows sanitized migration payload fields without inline PII', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(tx, makeEntityMigratedEvent());

    assert.deepEqual(capture.row?.payload, makeEntityMigratedEvent().payload);
  });

  it('trims identifier-like text fields before inserting', async () => {
    const { capture, tx } = makeEventTx();
    await appendEvent(
      tx,
      makeEntityMigratedEvent({
        payload: {
          ...makeEntityMigratedEvent().payload,
          fromLegalEntityId: ' le-old ',
          toLegalTenantId: ' tenant-home ',
        },
      })
    );

    const payload = capturedEntityMigratedPayload(capture);
    assert.equal(payload.fromLegalEntityId, 'le-old');
    assert.equal(payload.toLegalTenantId, 'tenant-home');
  });

  for (const [name, payload, error] of [
    [
      'inline member email',
      { ...makeEntityMigratedEvent().payload, memberEmail: 'member@example.invalid' },
      /memberEmail is not allowlisted/,
    ],
    [
      'unsupported approval kind',
      { ...makeEntityMigratedEvent().payload, approvalKind: 'bot' },
      /payload\.approvalKind to be a migration approval kind/,
    ],
    [
      'invalid governing law',
      { ...makeEntityMigratedEvent().payload, toGoverningLaw: 'Germany' },
      /payload\.toGoverningLaw to be ISO 3166 alpha-2 or null/,
    ],
    [
      'dry-run event mode',
      { ...makeEntityMigratedEvent().payload, migrationMode: 'dry_run' },
      /payload\.migrationMode to be a member entity migration mode/,
    ],
    [
      'blank legal entity id',
      { ...makeEntityMigratedEvent().payload, fromLegalEntityId: '   ' },
      /payload\.fromLegalEntityId to be text or null/,
    ],
  ] as const) {
    it(`rejects ${name} before inserting`, async () => {
      const { capture, tx } = makeEventTx();
      await assert.rejects(() => appendEvent(tx, makeEntityMigratedEvent({ payload })), error);
      assert.equal(capture.row, undefined);
    });
  }
});
