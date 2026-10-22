import assert from 'node:assert/strict';

// Fixed producer calls the actual configured before hooks, not a mock or supplied receipt.
export async function verifyAuthAuthority({ databaseHooks, userSchemaConfig }) {
  const beforeCreate = databaseHooks.user.create.before;
  const beforeUpdate = databaseHooks.user.update.before;
  const fields = [
    'role',
    'tenantId',
    'branchId',
    'memberNumber',
    'tenantClassificationPending',
    'agentId',
    'referralCode',
  ];
  for (const field of fields) assert.equal(userSchemaConfig.additionalFields[field].input, false);
  const headers = new Headers({ host: 'ida.localhost:3000' });
  const intent = {
    version: 1,
    tenant: 'tenant_ks',
    mode: 'deferred',
    host: 'ida.localhost',
    issuedAt: Date.now(),
  };
  const context = value => ({
    path: '/sign-up/email',
    headers,
    body: { __interdomestikAuthorityIntent: value },
  });
  const poisoned = {
    id: 'authority-fixture',
    name: 'Safe profile',
    role: 'super_admin',
    tenantId: 'tenant_mk',
    branchId: 'foreign-branch',
    memberNumber: 'FORGED',
    tenantClassificationPending: false,
    agentId: 'foreign-agent',
    referralCode: 'FORGED',
  };
  const assigned = await beforeCreate(poisoned, context(intent));
  assert.deepEqual(assigned.data, {
    ...poisoned,
    role: 'member',
    tenantId: 'tenant_ks',
    branchId: null,
    memberNumber: null,
    tenantClassificationPending: true,
    agentId: null,
    referralCode: null,
  });
  for (const invalid of [
    undefined,
    {},
    { ...intent, tenant: 'unknown' },
    { ...intent, issuedAt: Date.now() - 600001 },
    { ...intent, issuedAt: Date.now() + 60000 },
    { ...intent, host: 'attacker.invalid' },
    { ...intent, role: 'admin' },
  ]) {
    await assert.rejects(
      () => beforeCreate(poisoned, context(invalid)),
      error => error.body?.code === 'INVALID_ONBOARDING_CONTEXT'
    );
  }
  await assert.rejects(
    () =>
      beforeCreate(poisoned, {
        ...context({ ...intent, host: 'ks.localhost', tenant: 'tenant_mk', mode: 'resolved' }),
        headers: new Headers({ host: 'ks.localhost:3000' }),
      }),
    error => error.body?.code === 'INVALID_ONBOARDING_CONTEXT'
  );
  for (const field of fields) {
    await assert.rejects(
      async () => beforeUpdate({ name: 'Poisoned', [field]: poisoned[field] }),
      error => error.body?.code === 'AUTHORITY_FIELD_NOT_WRITABLE'
    );
  }
  await beforeUpdate({ name: 'Safe profile' });
  return [
    'schema-authority-input-disabled',
    'create-authority-canonicalized',
    'invalid-intent-rejected',
    'authority-update-rejected',
    'profile-update-allowed',
  ];
}
