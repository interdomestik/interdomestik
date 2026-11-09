import { auditLog } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { auditTransaction } from './audit-test-support';
import {
  readScheduledHandoverTasks,
  recordScheduledHandoverTask,
} from './handover-scheduled-tasks.core';

describe('scheduled handover tasks', () => {
  it('uses one conflict-safe identity per tenant, intent and effective instant', async () => {
    const db = auditTransaction();
    await recordScheduledHandoverTask(db.tx, 'tenant', 'intent', '2027-01-15T00:00:00Z');
    await recordScheduledHandoverTask(db.tx, 'tenant', 'intent', '2027-01-15T01:00:00+01:00');
    await recordScheduledHandoverTask(db.tx, 'tenant', 'intent', '2027-02-15T00:00:00Z');
    await recordScheduledHandoverTask(db.tx, 'other-tenant', 'intent', '2027-01-15T00:00:00Z');
    const rows = db.writes.filter(write => write.table === auditLog).map(write => write.values);
    expect(rows[0]).toEqual(rows[1]);
    expect(new Set(rows.map(row => ('id' in row ? row.id : null))).size).toBe(3);
    expect(rows[0]).toMatchObject({
      tenantId: 'tenant',
      entityId: 'intent',
      action: 'sponsor_intent.scheduled_cancel',
      metadata: { effectiveAt: '2027-01-15T00:00:00.000Z' },
    });
  });

  it('projects dated tasks from durable observations and excludes malformed dates', async () => {
    const db = auditTransaction({
      selects: [
        [
          {
            taskId: 'task',
            intentId: 'closed-intent',
            userId: 'member',
            metadata: { effectiveAt: '2027-01-15T00:00:00Z' },
          },
          {
            taskId: 'invalid',
            intentId: 'intent',
            userId: 'member',
            metadata: { effectiveAt: 'invalid' },
          },
        ],
      ],
    });
    await expect(readScheduledHandoverTasks(db.tx, 'tenant')).resolves.toEqual([
      {
        kind: 'scheduled_cancel',
        taskId: 'task',
        intentId: 'closed-intent',
        userId: 'member',
        effectiveAt: new Date('2027-01-15T00:00:00Z'),
      },
    ]);
  });
});
