import assert from 'node:assert/strict';
import test from 'node:test';

test('buildSeededMembershipCardIdentifiers returns deterministic values for seeded subscriptions', async () => {
  const seedGoldenModule = (await import('../src/seed-golden')) as {
    buildSeededMembershipCardIdentifiers?: (
      subscriptionId: string,
      tenantId: string
    ) => { cardNumber: string; qrCodeToken: string };
  };

  assert.equal(
    typeof seedGoldenModule.buildSeededMembershipCardIdentifiers,
    'function',
    'expected seed-golden to export deterministic membership card helpers'
  );

  const buildSeededMembershipCardIdentifiers =
    seedGoldenModule.buildSeededMembershipCardIdentifiers!;

  const ksCard = buildSeededMembershipCardIdentifiers('sub_ks_a_1', 'tenant_ks');
  assert.deepEqual(ksCard, {
    cardNumber: 'ID-KS-SUB_KS_A_1',
    qrCodeToken: 'qr_sub_ks_a_1',
  });

  const pilotCard = buildSeededMembershipCardIdentifiers('sub_pilot_prishtina_01', 'pilot-mk');
  assert.deepEqual(pilotCard, {
    cardNumber: 'ID-PILOT-SUB_PILOT_PRISHTINA_01',
    qrCodeToken: 'qr_sub_pilot_prishtina_01',
  });

  assert.deepEqual(
    buildSeededMembershipCardIdentifiers('sub_ks_a_1', 'tenant_ks'),
    buildSeededMembershipCardIdentifiers('sub_ks_a_1', 'tenant_ks'),
    'expected helper output to stay stable across repeated calls'
  );
});
