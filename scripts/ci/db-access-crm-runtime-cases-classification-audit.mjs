import assert from 'node:assert/strict';
import { runActionContext, assertContextClear } from './db-access-crm-runtime-context.mjs';
export async function runCrmClassificationAuditCases() {
  const runtime = await import('./crm-runtime.cjs');
  const { dbAdmin, user, auditLog, logAuditEvent, logTenantAuditEvent } = runtime;
  const { eq, sql } = await import('drizzle-orm');
  const actor = await dbAdmin.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, 'admin.ks@interdomestik.com'),
  });
  assert.ok(actor?.tenantId);
  const id = 'owned-classification-audit-probe';
  const now = new Date();
  await dbAdmin
    .insert(user)
    .values({
      id,
      tenantId: actor.tenantId,
      name: 'Owned audit fixture',
      email: id + '@example.invalid',
      role: 'member',
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      tenantClassificationPending: true,
    });
  const params = {
    session: { user: { id: actor.id, role: 'tenant_admin', tenantId: actor.tenantId } },
    userId: id,
    currentTenantId: actor.tenantId,
  };
  const first = await runActionContext(() => runtime.resolveTenantClassificationAction(params));
  assert.equal(first.result.success, true);
  assert.equal(first.result.data.previousPending, true);
  assert.ok(first.tags.some((tag) => tag.includes('/admin/users')));
  const persisted = await dbAdmin.select().from(auditLog).where(eq(auditLog.entityId, id));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].tenantId, actor.tenantId);
  assert.equal(persisted[0].actorId, actor.id);
  assert.equal(persisted[0].metadata.previousPending, true);
  assert.equal(persisted[0].metadata.resolutionMode, 'confirm_current');
  const base = {
    actorId: actor.id,
    actorRole: 'tenant_admin',
    tenantId: actor.tenantId,
    action: 'user.tenant_classification_confirmed',
    entityType: 'user',
    entityId: 'owned-audit-ambient-control',
    metadata: first.result.data,
  };
  await logAuditEvent(base);
  assert.equal(
    (await dbAdmin.select().from(auditLog).where(eq(auditLog.entityId, base.entityId))).length,
    0
  );
  const rejected = {
    ...base,
    entityId: 'owned-audit-rejected',
    actorId: 'nonexistent-owned-audit-actor',
  };
  await assert.doesNotReject(() => logTenantAuditEvent(rejected));
  assert.equal(
    (await dbAdmin.select().from(auditLog).where(eq(auditLog.entityId, rejected.entityId))).length,
    0
  );
  await assert.doesNotReject(() =>
    logTenantAuditEvent({ ...base, tenantId: null, entityId: 'owned-audit-missing-tenant' })
  );
  // Actual action best-effort SQL failure: confirmation remains committed while audit insert raises.
  await dbAdmin.update(user).set({ tenantClassificationPending: true }).where(eq(user.id, id));
  await dbAdmin.execute(
    sql.raw(
      `CREATE FUNCTION owned_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='owned-classification-audit-probe' THEN RAISE EXCEPTION 'owned audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER owned_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION owned_audit_failure();`
    )
  );
  try {
    const failedAudit = await runActionContext(() =>
      runtime.resolveTenantClassificationAction(params)
    );
    assert.equal(failedAudit.result.success, true);
    assert.equal(
      (await dbAdmin.query.user.findFirst({ where: eq(user.id, id) })).tenantClassificationPending,
      false
    );
    assert.equal(
      (await dbAdmin.select().from(auditLog).where(eq(auditLog.entityId, id))).length,
      1
    );
  } finally {
    await dbAdmin.execute(
      sql.raw('DROP TRIGGER owned_audit_failure ON audit_log; DROP FUNCTION owned_audit_failure()')
    );
  }
  await assertContextClear(runtime);
  return [
    'actual mounted confirm action persists scoped audit with actor/tenant/previousPending',
    'ambient writer unchanged; invalid actor/missing tenant and forced SQL audit failure best effort; committed confirmation survives',
  ];
}
