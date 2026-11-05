import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmTask, CrmTaskRepository } from '@interdomestik/domain-crm/tasks';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { CrmTenantExecutor } from './tenant-runner';
import {
  hydrateVisibleTask,
  replayIdempotentCreate,
  validateSubjectReference,
} from './task-repository-reads';
import {
  branchVisible,
  historyValues,
  isIdempotencyUniqueViolation,
  taskValues,
  taskVisibilityPredicate,
} from './task-row-mapping';

type CrmTaskDb = CrmTenantExecutor;
type CrmTaskRow = typeof crmTasks.$inferSelect;
type CrmTaskSaveParams = Parameters<CrmTaskRepository['saveTask']>[0];

async function assertWritableTaskSubject(
  database: Pick<CrmTaskDb, 'query'>,
  params: CrmTaskSaveParams
): Promise<void> {
  const visibility = await validateSubjectReference(database, {
    actor: params.actor,
    subjectReference: params.task.subjectReference,
  });
  if (!visibility.visible) throw new CrmTaskRepositoryFailure(visibility.reason);
  if (visibility.branchId !== params.task.branchId) {
    throw new CrmTaskRepositoryFailure('subject_not_visible');
  }
  if (!branchVisible(params.actor, params.task.branchId)) {
    throw new CrmTaskRepositoryFailure('subject_not_visible');
  }
}

async function hydrateSavedTask(
  database: Pick<CrmTaskDb, 'query'>,
  actor: CrmActorContext,
  row: CrmTaskRow
): Promise<CrmTask> {
  const task = await hydrateVisibleTask(database, actor, row);
  if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
  return task;
}

async function createSavedTask(database: CrmTaskDb, params: CrmTaskSaveParams): Promise<CrmTask> {
  if (params.task.lifecycleVersion !== 1) {
    throw new CrmTaskRepositoryFailure('lifecycle_conflict');
  }
  const replayed = await replayIdempotentCreate(database, params.actor, params.task);
  if (replayed) return replayed;

  try {
    const [row] = await database.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: CRM task create runs inside withTenantContext after subject visibility validates the actor tenant and branch.
      const [created] = await tx.insert(crmTasks).values(taskValues(params.task)).returning();
      // db-access-guard: tenant-scoped -- reason: CRM task history create runs inside withTenantContext and copies actor tenant from validated task history.
      await tx
        .insert(crmTaskHistory)
        .values(params.task.history.map(entry => historyValues(params.task.taskId, entry)));
      return [created];
    });
    return hydrateSavedTask(database, params.actor, row);
  } catch (error) {
    if (!isIdempotencyUniqueViolation(error)) throw error;
    const replayedAfterRace = await replayIdempotentCreate(database, params.actor, params.task);
    if (!replayedAfterRace) throw new CrmTaskRepositoryFailure('idempotency_conflict');
    return replayedAfterRace;
  }
}

async function updateSavedTask(
  database: CrmTaskDb,
  params: CrmTaskSaveParams & { expectedLifecycleVersion: number }
): Promise<CrmTask> {
  if (params.task.lifecycleVersion !== params.expectedLifecycleVersion + 1) {
    throw new CrmTaskRepositoryFailure('lifecycle_conflict');
  }
  // db-access-guard: tenant-scoped -- reason: CRM task save constrains by actor tenant, branch-visible task id, and expected lifecycle version.
  const [row] = await database.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: CRM task save runs inside withTenantContext and constrains by actor tenant, branch-visible task id, and expected lifecycle version.
    const [updated] = await tx
      .update(crmTasks)
      .set(taskValues(params.task))
      .where(
        and(
          taskVisibilityPredicate(params.actor, params.task.taskId),
          eq(crmTasks.lifecycleVersion, params.expectedLifecycleVersion)
        )
      )
      .returning();
    if (!updated) throw new CrmTaskRepositoryFailure('lifecycle_conflict');

    const newest = params.task.history.at(-1);
    if (newest) {
      // db-access-guard: tenant-scoped -- reason: CRM task history append runs inside withTenantContext and copies the actor tenant from the validated domain event.
      await tx.insert(crmTaskHistory).values(historyValues(params.task.taskId, newest));
    }
    return [updated];
  });
  return hydrateSavedTask(database, params.actor, row);
}

export async function saveCrmTaskInRepository(
  database: CrmTaskDb,
  params: CrmTaskSaveParams
): Promise<CrmTask> {
  await assertWritableTaskSubject(database, params);
  const { expectedLifecycleVersion } = params;
  if (expectedLifecycleVersion == null) return createSavedTask(database, params);
  return updateSavedTask(database, { ...params, expectedLifecycleVersion });
}
