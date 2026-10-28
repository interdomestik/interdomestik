import assert from 'node:assert/strict';
import { assertContextClear } from './db-access-crm-runtime-context.mjs';
export async function runCrmConfirmCurrentCases() {
  const runtime = await import('./crm-runtime.cjs');
  const { dbAdmin, db, user, withTenantContext, assertRlsConnectionRoleReady } = runtime;
  const { eq, sql } = await import('drizzle-orm');
  await assertRlsConnectionRoleReady();
  const tenant = await dbAdmin.query.tenants.findFirst();
  assert.ok(tenant);
  const id = 'owned-confirm-current-probe';
  const now = new Date();
  await dbAdmin
    .insert(user)
    .values({
      id,
      tenantId: tenant.id,
      name: 'Owned fixture',
      email: id + '@example.invalid',
      role: 'member',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      tenantClassificationPending: true,
    });
  const actor = await dbAdmin.query.user.findFirst({
    where: (u, { and, eq }) => and(eq(u.tenantId, tenant.id), eq(u.role, 'admin')),
  });
  assert.ok(actor);
  assert.equal(await db.query.user.findFirst({ where: eq(user.id, id) }), undefined);
  const visible = await withTenantContext({ tenantId: tenant.id }, (tx) =>
    tx.query.user.findFirst({ where: eq(user.id, id) })
  );
  assert.ok(visible);
  const params = {
    session: { user: { id: actor.id, role: 'tenant_admin', tenantId: tenant.id } },
    userId: id,
    currentTenantId: tenant.id,
  };
  const patched = runtime.resolveTenantClassificationDomain;
  const first = await patched(params);
  assert.equal(first.success, true);
  assert.deepEqual(first.data, {
    previousTenantId: tenant.id,
    tenantId: tenant.id,
    previousPending: true,
    tenantClassificationPending: false,
    resolutionMode: 'confirm_current',
  });
  assert.equal(
    (await dbAdmin.query.user.findFirst({ where: eq(user.id, id) })).tenantClassificationPending,
    false
  );
  const repeated = await patched(params);
  assert.equal(repeated.data.previousPending, false);
  assert.deepEqual(await patched({ ...params, userId: 'missing-owned-user' }), {
    error: 'User not found',
  });
  assert.deepEqual(
    await patched({ ...params, session: { user: { ...params.session.user, role: 'member' } } }),
    { error: 'Unauthorized' }
  );
  assert.deepEqual(await patched({ ...params, session: null }), { error: 'Unauthorized' });
  const other = await dbAdmin.query.tenants.findFirst({
    where: (t, { ne }) => ne(t.id, tenant.id),
  });
  assert.ok(other);
  assert.deepEqual(await patched({ ...params, currentTenantId: other.id }), {
    error: 'Unauthorized',
  });
  const foreignId = 'owned-confirm-current-foreign';
  await dbAdmin
    .insert(user)
    .values({
      id: foreignId,
      tenantId: other.id,
      name: 'Foreign',
      email: foreignId + '@example.invalid',
      role: 'member',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      tenantClassificationPending: true,
    });
  assert.deepEqual(await patched({ ...params, userId: foreignId }), { error: 'User not found' });
  assert.equal(
    (await dbAdmin.query.user.findFirst({ where: eq(user.id, foreignId) }))
      .tenantClassificationPending,
    true
  );
  await dbAdmin.update(user).set({ tenantClassificationPending: true }).where(eq(user.id, id));
  let releaseLock;
  const release = new Promise((resolve) => {
    releaseLock = resolve;
  });
  let signalLocked;
  const locked = new Promise((resolve) => {
    signalLocked = resolve;
  });
  const blocker = withTenantContext({ tenantId: tenant.id }, async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, id)).for('update');
    signalLocked();
    await release;
    await tx.update(user).set({ tenantClassificationPending: false }).where(eq(user.id, id));
  });
  await locked;
  let completed = false;
  const concurrent = patched(params).then((result) => {
    completed = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(completed, false);
  releaseLock();
  await blocker;
  const afterLock = await concurrent;
  assert.equal(afterLock.success, true);
  assert.equal(afterLock.data.previousPending, false);
  await dbAdmin.execute(
    sql.raw(
      `CREATE FUNCTION owned_suppress_classification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = 'owned-confirm-current-probe' THEN RETURN NULL; END IF; RETURN NEW; END $$; CREATE TRIGGER owned_suppress_classification BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE FUNCTION owned_suppress_classification();`
    )
  );
  try {
    assert.deepEqual(await patched(params), { error: 'Failed to resolve tenant classification' });
  } finally {
    await dbAdmin.execute(
      sql.raw(
        'DROP TRIGGER owned_suppress_classification ON "user"; DROP FUNCTION owned_suppress_classification()'
      )
    );
  }
  const settings = await db.execute(
    sql.raw(
      "SELECT current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_access_tenant_id',true) AS access"
    )
  );
  assert.ok(!settings[0].tenant && !settings[0].access);
  await assertRlsConnectionRoleReady();
  await assertContextClear(runtime);
  return [
    'own/repeated confirm persists; foreign user/tenant and member/anonymous denied',
    'row lock blocks competing confirm and observes fresh previousPending; zero-update refuses',
  ];
}
