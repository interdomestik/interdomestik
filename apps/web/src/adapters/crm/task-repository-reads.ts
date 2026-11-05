import type {
  CrmTask,
  CrmTaskSubjectReference,
  CrmTaskSubjectVisibility,
} from '@interdomestik/domain-crm/tasks';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  crmDeals,
  crmLeads,
  crmTaskHistory,
  crmTasks,
  supportHandoffs,
} from '@interdomestik/database/schema';

import type { CrmTenantExecutor } from './tenant-runner';
import { branchVisible, idempotencyMaterial, mapTask, type CrmTaskRow } from './task-row-mapping';

// CRM task reads that run on the caller's tenant transaction.

type CrmTaskDb = CrmTenantExecutor;

export async function replayIdempotentCreate(
  database: CrmTaskDb,
  actor: CrmActorContext,
  task: CrmTask
): Promise<CrmTask | null> {
  if (!task.idempotencyKey) return null;
  const existingRow = await database.query.crmTasks.findFirst({
    where: and(
      eq(crmTasks.tenantId, actor.tenantId),
      eq(crmTasks.idempotencyKey, task.idempotencyKey)
    ),
  });
  if (!existingRow) return null;
  const existing = await hydrateVisibleTask(database, actor, existingRow);
  if (!existing) throw new CrmTaskRepositoryFailure('idempotency_conflict');
  if (idempotencyMaterial(existing) !== idempotencyMaterial(task)) {
    throw new CrmTaskRepositoryFailure('idempotency_conflict');
  }
  return existing;
}

export async function hydrateVisibleTask(
  database: Pick<CrmTaskDb, 'query'>,
  actor: CrmActorContext,
  row: CrmTaskRow
): Promise<CrmTask | null> {
  if (!branchVisible(actor, row.branchId ?? null)) return null;
  const visibility = await validateSubjectReference(database, {
    actor,
    subjectReference: {
      id: row.subjectId,
      kind: row.subjectKind as CrmTaskSubjectReference['kind'],
    },
  });
  if (!visibility.visible) return null;

  const historyRows = await database.query.crmTaskHistory.findMany({
    orderBy: [
      asc(crmTaskHistory.occurredAt),
      asc(crmTaskHistory.createdAt),
      asc(crmTaskHistory.id),
    ],
    where: and(eq(crmTaskHistory.tenantId, actor.tenantId), eq(crmTaskHistory.taskId, row.id)),
  });

  return mapTask(row, historyRows);
}

export async function validateSubjectReference(
  database: Pick<CrmTaskDb, 'query'>,
  params: {
    actor: CrmActorContext;
    subjectReference: CrmTaskSubjectReference;
  }
): Promise<CrmTaskSubjectVisibility> {
  const { actor, subjectReference } = params;
  if (subjectReference.kind === 'account' || subjectReference.kind === 'contact') {
    return { reason: 'subject_proof_missing', visible: false };
  }

  if (subjectReference.kind === 'lead') {
    const row = await database.query.crmLeads.findFirst({
      where: and(eq(crmLeads.id, subjectReference.id), eq(crmLeads.tenantId, actor.tenantId)),
    });
    if (!row) return { reason: 'subject_not_found', visible: false };
    if (actor.role === 'agent' && row.agentId !== actor.actorId) {
      return { reason: 'subject_not_visible', visible: false };
    }
    return rowVisibility(actor, row);
  }

  if (subjectReference.kind === 'deal') {
    const row = await database.query.crmDeals.findFirst({
      where: and(
        eq(crmDeals.id, subjectReference.id),
        eq(crmDeals.tenantId, actor.tenantId),
        isNull(crmDeals.archivedAt)
      ),
    });
    return rowVisibility(actor, row);
  }

  const row = await database.query.supportHandoffs.findFirst({
    where: and(
      eq(supportHandoffs.id, subjectReference.id),
      eq(supportHandoffs.tenantId, actor.tenantId)
    ),
  });
  return rowVisibility(actor, row);
}

/** A found subject row is visible when the actor's branch scope reaches it. */
function rowVisibility(
  actor: CrmActorContext,
  row: { branchId?: string | null; tenantId: string } | undefined
): CrmTaskSubjectVisibility {
  if (!row) return { reason: 'subject_not_found', visible: false };
  if (!branchVisible(actor, row.branchId ?? null)) {
    return { reason: 'subject_not_visible', visible: false };
  }
  return { branchId: row.branchId ?? null, tenantId: row.tenantId, visible: true };
}
