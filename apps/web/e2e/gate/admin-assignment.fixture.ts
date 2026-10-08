import {
  and,
  auditLog,
  claimMessages,
  claims,
  claimStageHistory,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import type { TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

export async function withAdminAssignmentFixture<T>(
  info: TestInfo,
  run: (
    fixture: Readonly<{
      claimId: string;
      title: string;
      staffId: string;
      staffLabel: string;
      readState: () => Promise<{
        staffId: string | null;
        assignedById: string | null;
        assignedAt: Date | null;
        lifecycleUnchanged: boolean;
        audits: Array<{ action: string; actorId: string | null; metadata: unknown }>;
        messageCount: number;
        historyCount: number;
      }>;
    }>
  ) => Promise<T>
): Promise<T> {
  const seed = await resolveSeededClaimContext(info);
  const staff = await db.query.user.findFirst({
    where: and(eq(user.id, seed.staffId), eq(user.tenantId, seed.tenantId), eq(user.role, 'staff')),
    columns: { id: true, name: true, email: true, branchId: true },
  });
  if (!staff) throw new Error('Expected an eligible seeded staff target');
  const claimId = `s7-admin-target-${randomUUID()}`;
  const title = claimId;
  const scope = and(eq(claims.id, claimId), eq(claims.tenantId, seed.tenantId));
  try {
    await db.insert(claims).values({
      id: claimId,
      tenantId: seed.tenantId,
      accessTenantId: seed.tenantId,
      userId: seed.memberId,
      branchId: staff.branchId,
      staffId: null,
      title,
      claimNumber: claimId,
      category: 'vehicle',
      companyName: 'Synthetic assignment fixture',
      ...claimLifecycleFieldsForStatus('submitted'),
    });
    return await run({
      claimId,
      title,
      staffId: staff.id,
      staffLabel: staff.name || staff.email,
      readState: async () => {
        const row = await db.query.claims.findFirst({ where: scope });
        if (!row) throw new Error('Owned assignment fixture missing');
        const audits = await db.query.auditLog.findMany({
          where: and(eq(auditLog.tenantId, seed.tenantId), eq(auditLog.entityId, claimId)),
          columns: { action: true, actorId: true, metadata: true },
        });
        const messages = await db.query.claimMessages.findMany({
          where: and(eq(claimMessages.tenantId, seed.tenantId), eq(claimMessages.claimId, claimId)),
          columns: { id: true },
        });
        const history = await db.query.claimStageHistory.findMany({
          where: and(
            eq(claimStageHistory.tenantId, seed.tenantId),
            eq(claimStageHistory.claimId, claimId)
          ),
          columns: { id: true },
        });
        return {
          staffId: row.staffId,
          assignedById: row.assignedById,
          assignedAt: row.assignedAt,
          lifecycleUnchanged:
            row.caseLifecycleState === 'submitted' && row.recoveryLifecycleState === 'not_started',
          audits,
          messageCount: messages.length,
          historyCount: history.length,
        };
      },
    });
  } finally {
    await db
      .delete(auditLog)
      .where(and(eq(auditLog.tenantId, seed.tenantId), eq(auditLog.entityId, claimId)));
    await db
      .delete(claimMessages)
      .where(and(eq(claimMessages.tenantId, seed.tenantId), eq(claimMessages.claimId, claimId)));
    await db
      .delete(claimStageHistory)
      .where(
        and(eq(claimStageHistory.tenantId, seed.tenantId), eq(claimStageHistory.claimId, claimId))
      );
    await db.delete(claims).where(scope);
  }
}
