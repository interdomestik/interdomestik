import type {
  CrmTaskCreateReasonCode,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTaskSubjectReference,
} from './types';

export const CRM_TASK_WORK_QUEUE_PAGE_SIZE = 10;

const CRM_TASK_WORK_QUEUE_OPEN_STATUSES = new Set<CrmTaskStatus>(['pending', 'in_progress']);
const PRIORITY_RANK: Record<CrmTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type CrmTaskWorkQueueDueBucket = 'overdue' | 'due_today' | 'upcoming' | 'undated';

export type CrmTaskWorkQueueLeadDisplayRef = {
  readonly id: string;
  readonly label: string | null;
};

export type CrmTaskWorkQueueInputRow = {
  readonly assignedActorId: string | null;
  readonly branchId: string | null;
  readonly createReasonCode: CrmTaskCreateReasonCode;
  readonly dueAt: string | null;
  readonly leadDisplayRef: CrmTaskWorkQueueLeadDisplayRef;
  readonly lifecycleVersion: number;
  readonly priority: CrmTaskPriority;
  readonly status: CrmTaskStatus;
  readonly subjectReference: CrmTaskSubjectReference;
  readonly taskId: string;
  readonly tenantId: string;
};

export type CrmTaskWorkQueueItem = {
  readonly createReasonCode: CrmTaskCreateReasonCode;
  readonly displayLabelCode: CrmTaskCreateReasonCode;
  readonly dueAt: string | null;
  readonly dueBucket: CrmTaskWorkQueueDueBucket;
  readonly leadDisplayRef: CrmTaskWorkQueueLeadDisplayRef;
  readonly lifecycleVersion: number;
  readonly priority: CrmTaskPriority;
  readonly status: Extract<CrmTaskStatus, 'pending' | 'in_progress'>;
  readonly subjectReference: {
    readonly id: string;
    readonly kind: 'lead';
  };
  readonly taskId: string;
};

export function getCrmTaskWorkQueueDueBucket(
  dueAt: string | null,
  nowIso: string
): CrmTaskWorkQueueDueBucket {
  if (!dueAt) return 'undated';

  const due = new Date(dueAt);
  const now = new Date(nowIso);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (dueDay < nowDay) return 'overdue';
  if (dueDay === nowDay) return 'due_today';
  return 'upcoming';
}

function datedRank(item: Pick<CrmTaskWorkQueueItem, 'dueAt'>): number {
  return item.dueAt ? 0 : 1;
}

export function compareCrmTaskWorkQueueItems(
  left: CrmTaskWorkQueueItem,
  right: CrmTaskWorkQueueItem
): number {
  const datedDiff = datedRank(left) - datedRank(right);
  if (datedDiff !== 0) return datedDiff;

  if (left.dueAt && right.dueAt) {
    const dueDiff = Date.parse(left.dueAt) - Date.parse(right.dueAt);
    if (dueDiff !== 0) return dueDiff;
  }

  const priorityDiff = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (priorityDiff !== 0) return priorityDiff;

  return left.taskId.localeCompare(right.taskId);
}

export function deriveCrmTaskWorkQueue(params: {
  readonly actorId: string;
  readonly branchId: string;
  readonly limit?: number;
  readonly now: string;
  readonly rows: readonly CrmTaskWorkQueueInputRow[];
  readonly tenantId: string;
}): CrmTaskWorkQueueItem[] {
  const limit = params.limit ?? CRM_TASK_WORK_QUEUE_PAGE_SIZE;

  return params.rows
    .filter(row => {
      if (row.tenantId !== params.tenantId) return false;
      if (row.branchId !== params.branchId) return false;
      if (row.assignedActorId !== params.actorId) return false;
      if (row.subjectReference.kind !== 'lead') return false;
      return CRM_TASK_WORK_QUEUE_OPEN_STATUSES.has(row.status);
    })
    .map(row => ({
      createReasonCode: row.createReasonCode,
      displayLabelCode: row.createReasonCode,
      dueAt: row.dueAt,
      dueBucket: getCrmTaskWorkQueueDueBucket(row.dueAt, params.now),
      leadDisplayRef: row.leadDisplayRef,
      lifecycleVersion: row.lifecycleVersion,
      priority: row.priority,
      status: row.status as CrmTaskWorkQueueItem['status'],
      subjectReference: row.subjectReference as CrmTaskWorkQueueItem['subjectReference'],
      taskId: row.taskId,
    }))
    .sort(compareCrmTaskWorkQueueItems)
    .slice(0, limit);
}
