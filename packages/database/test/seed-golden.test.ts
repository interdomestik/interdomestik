import assert from 'node:assert/strict';
import test from 'node:test';

test('buildSeededMembershipCardIdentifiers returns deterministic values for seeded subscriptions', async () => {
  const seedGoldenModule = (await import('../src/seed-golden')) as {
    seedGolden?: (config: unknown) => Promise<void>;
    buildSeededMembershipCardIdentifiers?: (
      subscriptionId: string,
      tenantId: string
    ) => { cardNumber: string; qrCodeToken: string };
  };

  assert.equal(
    typeof seedGoldenModule.seedGolden,
    'function',
    'expected seed-golden to export the public seeder entrypoint'
  );

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
  const expectedPilotQrCodeToken = ['qr', 'sub', 'pilot', 'prishtina', '01'].join('_');
  assert.deepEqual(pilotCard, {
    cardNumber: 'ID-PILOT-SUB_PILOT_PRISHTINA_01',
    qrCodeToken: expectedPilotQrCodeToken,
  });

  assert.deepEqual(
    buildSeededMembershipCardIdentifiers('sub_ks_a_1', 'tenant_ks'),
    buildSeededMembershipCardIdentifiers('sub_ks_a_1', 'tenant_ks'),
    'expected helper output to stay stable across repeated calls'
  );
});

test('seedGolden orchestrator preserves sequential module-call order', async () => {
  const { SEED_GOLDEN_STEP_ORDER, runSeedGoldenSteps } = await import('../src/seed-golden/index');
  const expectedOrder = [
    'cleanup',
    'tenants',
    'branches',
    'users',
    'agent-assignments',
    'memberships',
    'agent-settings',
    'claims',
    'leads',
    'tracking-tokens',
    'member-counters',
  ];
  const calls: string[] = [];
  const makeStep = (name: string) => async () => {
    calls.push(name);
  };
  const originalLog = console.log;

  console.log = () => {};
  try {
    await runSeedGoldenSteps({} as never, {
      cleanup: makeStep('cleanup'),
      tenants: makeStep('tenants'),
      branches: makeStep('branches'),
      users: makeStep('users'),
      agentAssignments: makeStep('agent-assignments'),
      memberships: makeStep('memberships'),
      agentSettings: makeStep('agent-settings'),
      claims: makeStep('claims'),
      leads: makeStep('leads'),
      trackingTokens: makeStep('tracking-tokens'),
      memberCounters: makeStep('member-counters'),
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(SEED_GOLDEN_STEP_ORDER, expectedOrder);
  assert.deepEqual(calls, expectedOrder);
});
