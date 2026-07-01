import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type {
  CrmTask,
  CrmTaskHistoryEntry,
  CrmTaskRepository,
  CrmTaskSubjectReference,
  CrmTaskSubjectVisibility,
} from '@interdomestik/domain-crm/tasks';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import type { db } from '@interdomestik/database/db';
import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';

type CrmTaskDb = typeof db;
type CrmTaskRow = typeof crmTasks.$inferSelect;
type CrmTaskInsert = typeof crmTasks.$inferInsert;
type CrmTaskHistoryInsert = typeof crmTaskHistory.$inferInsert;
type CrmTaskSaveParams = Parameters<CrmTaskRepository['saveTask']>[0];

export type CrmTaskSaveDeps = {
  branchVisible(actor: CrmActorContext, branchId: string | null): boolean;
  historyValues(taskId: string, entry: CrmTaskHistoryEntry): CrmTaskHistoryInsert;
  hydrateVisibleTask(
    database: Pick<CrmTaskDb, 'query'>,
    actor: CrmActorContext,
    row: CrmTaskRow
  ): Promise<CrmTask | null>;
  isIdempotencyUniqueViolation(error: unknown): boolean;
  replayIdempotentCreate(
    database: CrmTaskDb,
    actor: CrmActorContext,
    task: CrmTask
  ): Promise<CrmTask | null>;
  taskValues(task: CrmTask): CrmTaskInsert;
  taskVisibilityPredicate(actor: CrmActorContext, taskId?: string): SQL | undefined;
  validateSubjectReference(
    database: Pick<CrmTaskDb, 'query'>,
    params: { actor: CrmActorContext; subjectReference: CrmTaskSubjectReference }
  ): Promise<CrmTaskSubjectVisibility>;
};

async function assertWritableTaskSubject(
  database: Pick<CrmTaskDb, 'query'>,
  params: CrmTaskSaveParams,
  deps: CrmTaskSaveDeps
): Promise<void> {
  const visibility = await deps.validateSubjectReference(database, {
    actor: params.actor,
    subjectReference: params.task.subjectReference,
  });
  if (!visibility.visible) throw new CrmTaskRepositoryFailure(visibility.reason);
  if (visibility.branchId !== params.task.branchId) {
    throw new CrmTaskRepositoryFailure('subject_not_visible');
  }
  if (!deps.branchVisible(params.actor, params.task.branchId)) {
    throw new CrmTaskRepositoryFailure('subject_not_visible');
  }
}

async function hydrateSavedTask(
  database: Pick<CrmTaskDb, 'query'>,
  actor: CrmActorContext,
  row: CrmTaskRow,
  deps: CrmTaskSaveDeps
): Promise<CrmTask> {
  const task = await deps.hydrateVisibleTask(database, actor, row);
  if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
  return task;
}

async function createSavedTask(
  database: CrmTaskDb,
  params: CrmTaskSaveParams,
  deps: CrmTaskSaveDeps
): Promise<CrmTask> {
  if (params.task.lifecycleVersion !== 1) {
    throw new CrmTaskRepositoryFailure('lifecycle_conflict');
  }
  const replayed = await deps.replayIdempotentCreate(database, params.actor, params.task);
  if (replayed) return replayed;

  try {
    const [row] = await database.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: CRM task create runs inside withTenantContext after subject visibility validates the actor tenant and branch.
      const [created] = await tx.insert(crmTasks).values(deps.taskValues(params.task)).returning();
      // db-access-guard: tenant-scoped -- reason: CRM task history create runs inside withTenantContext and copies actor tenant from validated task history.
      await tx
        .insert(crmTaskHistory)
        .values(params.task.history.map(entry => deps.historyValues(params.task.taskId, entry)));
      return [created];
    });
    return hydrateSavedTask(database, params.actor, row, deps);
  } catch (error) {
    if (!deps.isIdempotencyUniqueViolation(error)) throw error;
    const replayedAfterRace = await deps.replayIdempotentCreate(database, params.actor, params.task);
    if (!replayedAfterRace) throw new CrmTaskRepositoryFailure('idempotency_conflict');
    return replayedAfterRace;
  }
}

async function updateSavedTask(
  database: CrmTaskDb,
  params: CrmTaskSaveParams & { expectedLifecycleVersion: number },
  deps: CrmTaskSaveDeps
): Promise<CrmTask> {
  if (params.task.lifecycleVersion !== params.expectedLifecycleVersion + 1) {
    throw new CrmTaskRepositoryFailure('lifecycle_conflict');
  }
  // db-access-guard: tenant-scoped -- reason: CRM task save constrains by actor tenant, branch-visible task id, and expected lifecycle version.
  const [row] = await database.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: CRM task save runs inside withTenantContext and constrains by actor tenant, branch-visible task id, and expected lifecycle version.
    const [updated] = await tx
      .update(crmTasks)
      .set(deps.taskValues(params.task))
      .where(
        and(
          deps.taskVisibilityPredicate(params.actor, params.task.taskId),
          eq(crmTasks.lifecycleVersion, params.expectedLifecycleVersion)
        )
      )
      .returning();
    if (!updated) throw new CrmTaskRepositoryFailure('lifecycle_conflict');

    const newest = params.task.history.at(-1);
    if (newest) {
      // db-access-guard: tenant-scoped -- reason: CRM task history append runs inside withTenantContext and copies the actor tenant from the validated domain event.
      await tx.insert(crmTaskHistory).values(deps.historyValues(params.task.taskId, newest));
    }
    return [updated];
  });
  return hydrateSavedTask(database, params.actor, row, deps);
}

export async function saveCrmTaskInRepository(
  database: CrmTaskDb,
  params: CrmTaskSaveParams,
  deps: CrmTaskSaveDeps
): Promise<CrmTask> {
  await assertWritableTaskSubject(database, params, deps);
  return params.expectedLifecycleVersion == null
    ? createSavedTask(database, params, deps)
    : updateSavedTask(database, { ...params, expectedLifecycleVersion: params.expectedLifecycleVersion }, deps);
}
