import { describe, expect, it } from 'vitest';

import { deriveCrmTaskWorkQueue, getCrmTaskWorkQueueDueBucket } from './work-queue';
import type { CrmTaskWorkQueueInputRow } from './work-queue';

const baseRow: CrmTaskWorkQueueInputRow = {
  assignedActorId: 'agent-1',
  branchId: 'branch-1',
  createReasonCode: 'follow_up',
  dueAt: '2026-05-22T12:00:00.000Z',
  leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
  lifecycleVersion: 1,
  priority: 'normal',
  status: 'pending',
  subjectReference: { id: 'lead-1', kind: 'lead' },
  taskId: 'task-1',
  tenantId: 'tenant-1',
};

describe('deriveCrmTaskWorkQueue', () => {
  it('keeps only visible assigned open lead-backed tasks', () => {
    const items = deriveCrmTaskWorkQueue({
      actorId: 'agent-1',
      branchId: 'branch-1',
      now: '2026-05-22T08:00:00.000Z',
      rows: [
        baseRow,
        { ...baseRow, taskId: 'off-tenant', tenantId: 'tenant-2' },
        { ...baseRow, taskId: 'off-branch', branchId: 'branch-2' },
        { ...baseRow, taskId: 'off-agent', assignedActorId: 'agent-2' },
        { ...baseRow, taskId: 'completed', status: 'completed' },
        { ...baseRow, taskId: 'deal-task', subjectReference: { id: 'deal-1', kind: 'deal' } },
      ],
      tenantId: 'tenant-1',
    });

    expect(items).toEqual([
      expect.objectContaining({
        displayLabelCode: 'follow_up',
        dueBucket: 'due_today',
        status: 'pending',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-1',
      }),
    ]);
  });

  it('sorts dated tasks before undated tasks by due date, priority, and task id', () => {
    const items = deriveCrmTaskWorkQueue({
      actorId: 'agent-1',
      branchId: 'branch-1',
      limit: 10,
      now: '2026-05-22T08:00:00.000Z',
      rows: [
        { ...baseRow, taskId: 'task-undated', dueAt: null, priority: 'urgent' },
        {
          ...baseRow,
          taskId: 'task-normal-a',
          dueAt: '2026-05-22T12:00:00.000Z',
          priority: 'normal',
        },
        {
          ...baseRow,
          taskId: 'task-urgent',
          dueAt: '2026-05-22T12:00:00.000Z',
          priority: 'urgent',
        },
        {
          ...baseRow,
          taskId: 'task-normal-b',
          dueAt: '2026-05-22T12:00:00.000Z',
          priority: 'normal',
        },
        { ...baseRow, taskId: 'task-earliest', dueAt: '2026-05-21T23:00:00.000Z', priority: 'low' },
      ],
      tenantId: 'tenant-1',
    });

    expect(items.map(item => item.taskId)).toEqual([
      'task-earliest',
      'task-urgent',
      'task-normal-a',
      'task-normal-b',
      'task-undated',
    ]);
  });

  it('pins the first page to the requested bounded limit', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...baseRow,
      taskId: `task-${String(index).padStart(2, '0')}`,
    }));

    expect(
      deriveCrmTaskWorkQueue({
        actorId: 'agent-1',
        branchId: 'branch-1',
        limit: 10,
        now: '2026-05-22T08:00:00.000Z',
        rows,
        tenantId: 'tenant-1',
      })
    ).toHaveLength(10);
  });
});

describe('getCrmTaskWorkQueueDueBucket', () => {
  it('classifies overdue, today, upcoming, and undated tasks', () => {
    const now = '2026-05-22T08:00:00.000Z';

    expect(getCrmTaskWorkQueueDueBucket('2026-05-21T23:59:00.000Z', now)).toBe('overdue');
    expect(getCrmTaskWorkQueueDueBucket('2026-05-22T23:59:00.000Z', now)).toBe('due_today');
    expect(getCrmTaskWorkQueueDueBucket('2026-05-23T00:00:00.000Z', now)).toBe('upcoming');
    expect(getCrmTaskWorkQueueDueBucket(null, now)).toBe('undated');
  });
});
