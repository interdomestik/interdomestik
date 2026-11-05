import type { CrmTaskRepository, CrmTaskSubjectReference } from '@interdomestik/domain-crm/tasks';
import { CrmTaskRepositoryFailure } from '@interdomestik/domain-crm/tasks';
import { and, eq, sql } from 'drizzle-orm';

import { crmTaskHistory, crmTasks } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { saveCrmTaskInRepository } from './task-repository-save';
import { hydrateVisibleTask, validateSubjectReference } from './task-repository-reads';
import { historyValues, taskVisibilityPredicate } from './task-row-mapping';

export function createCrmTaskRepository(authority: TenantAuthority): CrmTaskRepository {
  return {
    async appendTaskHistory(params) {
      return withTenantAuthority(authority, async scopedDatabase => {
        const existingRow = await scopedDatabase.query.crmTasks.findFirst({
          where: taskVisibilityPredicate(params.actor, params.taskId),
        });
        if (!existingRow) throw new CrmTaskRepositoryFailure('lifecycle_conflict');

        const visibility = await validateSubjectReference(scopedDatabase, {
          actor: params.actor,
          subjectReference: {
            id: existingRow.subjectId,
            kind: existingRow.subjectKind as CrmTaskSubjectReference['kind'],
          },
        });
        if (!visibility.visible) throw new CrmTaskRepositoryFailure(visibility.reason);
        if (visibility.branchId !== (existingRow.branchId ?? null)) {
          throw new CrmTaskRepositoryFailure('subject_not_visible');
        }

        // db-access-guard: tenant-scoped -- reason: CRM task history append constrains by actor tenant, branch-visible task id, and expected lifecycle version.
        const [row] = await scopedDatabase.transaction(async tx => {
          // db-access-guard: tenant-scoped -- reason: CRM task update runs inside withTenantContext and constrains by actor tenant, branch-visible task id, and expected lifecycle version.
          const [updated] = await tx
            .update(crmTasks)
            .set({
              lifecycleVersion: sql`${crmTasks.lifecycleVersion} + 1`,
              status: params.entry.toStatus,
              updatedAt: new Date(params.entry.timestamp),
            })
            .where(
              and(
                taskVisibilityPredicate(params.actor, params.taskId),
                eq(crmTasks.lifecycleVersion, params.expectedLifecycleVersion)
              )
            )
            .returning();

          if (!updated) throw new CrmTaskRepositoryFailure('lifecycle_conflict');
          // db-access-guard: tenant-scoped -- reason: CRM task history row runs inside withTenantContext and copies the actor tenant from the validated domain event.
          await tx.insert(crmTaskHistory).values(historyValues(params.taskId, params.entry));
          return [updated];
        });

        const task = await hydrateVisibleTask(scopedDatabase, params.actor, row);
        if (!task) throw new CrmTaskRepositoryFailure('subject_not_visible');
        return task;
      });
    },

    async findTaskById(params) {
      return withTenantAuthority(authority, async scopedDatabase => {
        // db-access-guard: tenant-scoped -- reason: CRM task lookup constrains by actor tenant and branch-visible task id before hydration.
        const row = await scopedDatabase.query.crmTasks.findFirst({
          where: taskVisibilityPredicate(params.actor, params.taskId),
        });
        if (!row) return null;
        return hydrateVisibleTask(scopedDatabase, params.actor, row);
      });
    },

    async findTaskByIdempotencyKey(params) {
      return withTenantAuthority(authority, async scopedDatabase => {
        // db-access-guard: tenant-scoped -- reason: CRM task idempotency lookup constrains by actor tenant, branch visibility, and opaque idempotency key.
        const row = await scopedDatabase.query.crmTasks.findFirst({
          where: and(
            taskVisibilityPredicate(params.actor),
            eq(crmTasks.idempotencyKey, params.idempotencyKey)
          ),
        });
        if (!row) return null;
        return hydrateVisibleTask(scopedDatabase, params.actor, row);
      });
    },

    async saveTask(params) {
      return withTenantAuthority(authority, async scopedDatabase => {
        return saveCrmTaskInRepository(scopedDatabase, params);
      });
    },

    validateSubjectReference(params) {
      return withTenantAuthority(authority, scopedDatabase =>
        validateSubjectReference(scopedDatabase, params)
      );
    },
  };
}
