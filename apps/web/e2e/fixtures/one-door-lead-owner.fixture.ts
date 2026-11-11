import { randomUUID } from 'node:crypto';
import { and, branches, db, eq, sql, tenantSettings } from '@interdomestik/database';
import { requireDoorActor } from './one-door-data.fixture';

const owners = {
  tenant_ks: 'KS_AGENT',
  tenant_mk: 'MK_AGENT',
  'pilot-mk': 'PILOT_MK_AGENT',
} as const;
type LeadOwner = { agentId: string; branchId: string };

export async function withDoorLeadOwner(
  tenantId: keyof typeof owners,
  run: (owner: LeadOwner) => Promise<void>
): Promise<void> {
  // Serialize projects sharing this tenant from snapshot through restore. Writes commit
  // separately from the lock transaction so the running application can read them.
  await db.transaction(async tx => {
    const lockKey = `one-door-business-owner:${tenantId}`;
    await tx.select({ held: sql`pg_advisory_xact_lock(hashtext(${lockKey}))` });
    const actor = await requireDoorActor(owners[tenantId]);
    if (!actor.branchId) throw new Error(`Missing lead owner branch for ${tenantId}`);
    const branch = await db.query.branches.findFirst({
      where: and(eq(branches.id, actor.branchId), eq(branches.tenantId, tenantId)),
    });
    if (!branch?.isActive) throw new Error(`Missing active tenant-local branch for ${tenantId}`);
    const scope = and(
      eq(tenantSettings.tenantId, tenantId),
      eq(tenantSettings.category, 'sales'),
      eq(tenantSettings.key, 'business_lead_owner')
    );
    const previous = await db.query.tenantSettings.findFirst({ where: scope });
    const id = previous?.id ?? `one-door-owner-${randomUUID()}`;
    try {
      await db
        .insert(tenantSettings)
        .values({
          id,
          tenantId,
          category: 'sales',
          key: 'business_lead_owner',
          value: { agentId: actor.id, branchId: branch.id },
        })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.category, tenantSettings.key],
          set: { value: { agentId: actor.id, branchId: branch.id }, updatedAt: new Date() },
        });
      await run({ agentId: actor.id, branchId: branch.id });
    } finally {
      if (previous) {
        await db
          .update(tenantSettings)
          .set({
            value: previous.value,
            updatedAt: previous.updatedAt,
          })
          .where(eq(tenantSettings.id, previous.id));
      } else {
        await db.delete(tenantSettings).where(eq(tenantSettings.id, id));
      }
    }
  });
}
