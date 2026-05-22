import { describe, expect, it } from 'vitest';

import {
  deriveCrmTaskCompletedQueue,
  deriveCrmTaskWorkQueue,
  getCrmTaskWorkQueueDueBucket,
} from './work-queue';
import type { CrmTaskCompletedQueueInputRow, CrmTaskWorkQueueInputRow } from './work-queue';

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

const completedBaseRow: CrmTaskCompletedQueueInputRow = {
  assignedActorId: 'agent-1',
  branchId: 'branch-1',
  completedAt: '2026-05-22T12:00:00.000Z',
  completionReasonCode: 'resolved',
  dueAt: '2026-05-21T12:00:00.000Z',
  leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
  lifecycleVersion: 2,
  priority: 'normal',
  status: 'completed',
  subjectReference: { id: 'lead-1', kind: 'lead' },
  taskId: 'task-completed',
  tenantId: 'tenant-1',
};

describe('deriveCrmTaskCompletedQueue', () => {
  it('keeps only visible assigned completed lead-backed tasks with completedAt', () => {
    const items = deriveCrmTaskCompletedQueue({
      actorId: 'agent-1',
      branchId: 'branch-1',
      rows: [
        completedBaseRow,
        { ...completedBaseRow, taskId: 'off-tenant', tenantId: 'tenant-2' },
        { ...completedBaseRow, taskId: 'off-branch', branchId: 'branch-2' },
        { ...completedBaseRow, taskId: 'off-agent', assignedActorId: 'agent-2' },
        { ...completedBaseRow, taskId: 'pending', status: 'pending' },
        { ...completedBaseRow, taskId: 'cancelled', status: 'cancelled' },
        { ...completedBaseRow, taskId: 'without-completed-at', completedAt: null },
        {
          ...completedBaseRow,
          taskId: 'deal-task',
          subjectReference: { id: 'deal-1', kind: 'deal' },
        },
      ],
      tenantId: 'tenant-1',
    });

    expect(items).toEqual([
      {
        completedAt: '2026-05-22T12:00:00.000Z',
        completionReasonCode: 'resolved',
        dueAt: '2026-05-21T12:00:00.000Z',
        leadDisplayRef: { id: 'lead-1', label: 'Lead One' },
        lifecycleVersion: 2,
        priority: 'normal',
        status: 'completed',
        subjectReference: { id: 'lead-1', kind: 'lead' },
        taskId: 'task-completed',
      },
    ]);
  });

  it('sorts most recently completed first and applies the row cap', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      ...completedBaseRow,
      completedAt: new Date(Date.UTC(2026, 4, 22, index)).toISOString(),
      taskId: `task-${index}`,
    }));

    const items = deriveCrmTaskCompletedQueue({
      actorId: 'agent-1',
      branchId: 'branch-1',
      limit: 3,
      rows,
      tenantId: 'tenant-1',
    });

    expect(items.map(item => item.taskId)).toEqual(['task-7', 'task-6', 'task-5']);
  });
});
