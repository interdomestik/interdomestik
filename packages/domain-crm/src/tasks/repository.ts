import type { CrmActorContext } from '../context';
import type { CrmTask, CrmTaskHistoryEntry, CrmTaskSubjectReference } from './types';

export type CrmTaskSubjectVisibility =
  | { readonly branchId?: string | null; readonly tenantId: string; readonly visible: true }
  | {
      readonly reason: 'subject_not_found' | 'subject_not_visible' | 'subject_proof_missing';
      readonly visible: false;
    };

export interface CrmTaskRepository {
  appendTaskHistory(params: {
    actor: CrmActorContext;
    entry: CrmTaskHistoryEntry;
    taskId: string;
  }): Promise<CrmTask>;
  findTaskById(params: { actor: CrmActorContext; taskId: string }): Promise<CrmTask | null>;
  findTaskByIdempotencyKey(params: {
    actor: CrmActorContext;
    idempotencyKey: string;
  }): Promise<CrmTask | null>;
  saveTask(params: { actor: CrmActorContext; task: CrmTask }): Promise<CrmTask>;
  validateSubjectReference?(params: {
    actor: CrmActorContext;
    subjectReference: CrmTaskSubjectReference;
  }): Promise<CrmTaskSubjectVisibility>;
}
