import assert from 'node:assert/strict';
import test from 'node:test';
import { dbAdmin } from '../src/db';
import { appendAnonymousTenantAuditEvent } from '../src/anonymous-tenant-audit';
import { auditLog } from '../src/schema/notes';

function mockAdmin(t: test.TestContext, activeRows: unknown[]) {
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const select = t.mock.method(dbAdmin, 'select', (() => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(activeRows),
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  const insert = t.mock.method(dbAdmin, 'insert', ((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return Promise.resolve();
    },
  })) as unknown as typeof dbAdmin.insert);
  return { inserts, select, insert };
}

test('an allowlisted anonymous event is appended to an active tenant with no actor', async t => {
  const { inserts } = mockAdmin(t, [{ id: 'tenant_ks' }]);

  const appended = await appendAnonymousTenantAuditEvent({
    tenantId: ' tenant_ks ',
    action: 'auth.signin_denied_wrong_tenant',
    entityType: 'auth',
    metadata: { route: '/api/auth/sign-in/email', reason: 'tenant_mismatch' },
  });

  assert.equal(appended, true);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, auditLog);
  assert.equal(inserts[0].values.tenantId, 'tenant_ks');
  assert.equal(inserts[0].values.actorId, null);
  assert.equal(inserts[0].values.actorRole, null);
  assert.equal(inserts[0].values.entityId, null);
  assert.equal(inserts[0].values.action, 'auth.signin_denied_wrong_tenant');
});

test('an unknown action, entity type, blank tenant or oversized metadata writes nothing', async t => {
  const { inserts, select } = mockAdmin(t, [{ id: 'tenant_ks' }]);
  const base = { tenantId: 'tenant_ks', entityType: 'auth' as const };

  assert.equal(await appendAnonymousTenantAuditEvent({ ...base, action: 'claims.read' }), false);
  assert.equal(
    await appendAnonymousTenantAuditEvent({
      ...base,
      action: 'auth.password_reset_requested',
      entityType: 'claim' as never,
    }),
    false
  );
  assert.equal(
    await appendAnonymousTenantAuditEvent({
      ...base,
      tenantId: ' ',
      action: 'auth.password_reset_requested',
    }),
    false
  );
  assert.equal(
    await appendAnonymousTenantAuditEvent({
      ...base,
      action: 'auth.password_reset_requested',
      metadata: { blob: 'x'.repeat(4_096) },
    }),
    false
  );
  assert.equal(select.mock.callCount(), 0, 'refused events never touch the database');
  assert.equal(inserts.length, 0);
});

test('an inactive or unknown tenant writes nothing', async t => {
  const { inserts } = mockAdmin(t, []);
  assert.equal(
    await appendAnonymousTenantAuditEvent({
      tenantId: 'tenant_gone',
      action: 'auth.password_reset_requested',
      entityType: 'auth',
    }),
    false
  );
  assert.equal(inserts.length, 0);
});
