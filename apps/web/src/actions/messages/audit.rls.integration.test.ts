import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  fixture,
  homeTenantId,
  ids,
  registerMessageRlsFixture,
} from '../../../../../packages/domain-communications/src/messages/tenant-context.integration-fixture';
import type { logMessageAuditEvent } from './audit.core';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
suite('actual S8 message audit adapter', () => {
  registerMessageRlsFixture();
  let audit: typeof logMessageAuditEvent;
  let readStaff: typeof import('@/features/staff/claims/assignment-options').getStaffAssignmentOptions;
  beforeAll(async () => {
    ({ logMessageAuditEvent: audit } = await import('./audit.core'));
    ({ getStaffAssignmentOptions: readStaff } =
      await import('@/features/staff/claims/assignment-options'));
  });
  it('reads staff assignment options with the actual restricted tenant context', async () => {
    expect(await readStaff({ tenantId: homeTenantId, role: 'staff' })).toEqual([
      { id: ids.staff, label: 'Synthetic Staff Sender' },
    ]);
    expect(
      await readStaff({ tenantId: homeTenantId, role: 'staff', branchId: ids.otherBranch })
    ).toEqual([]);
  });

  it('persists a tenant-bound audit through the actual restricted post-commit adapter', async () => {
    await audit({
      tenantId: homeTenantId,
      actorId: ids.staff,
      actorRole: 'staff',
      action: 'claim.message_sent',
      entityType: 'claim',
      entityId: ids.claim,
      metadata: { internal: false, length: 7 },
      headers: new Headers(),
    });
    const rows = await fixture.database.dbAdmin.query.auditLog.findMany({
      where: and(
        eq(fixture.database.auditLog.entityId, ids.claim),
        eq(fixture.database.auditLog.action, 'claim.message_sent')
      ),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: homeTenantId,
        actorId: ids.staff,
        actorRole: 'staff',
        metadata: expect.objectContaining({ internal: false, length: 7 }),
      }),
    ]);
    const [context] = await fixture.rlsClient`
      select nullif(current_setting('app.current_tenant_id',true),'') as tenant,
        nullif(current_setting('app.current_access_tenant_id',true),'') as access,
        nullif(current_setting('app.user_role',true),'') as role
    `;
    expect(context).toEqual({ tenant: null, access: null, role: null });
  });
});
