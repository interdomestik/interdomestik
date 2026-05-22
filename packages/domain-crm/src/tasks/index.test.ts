import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { CrmActorContext } from '../context';
import {
  assignCrmTask,
  cancelCrmTask,
  completeCrmTask,
  createCrmTask,
  isCrmTaskTerminalStatus,
  reopenCrmTask,
  startCrmTask,
  updateCrmTaskDueAt,
  type CrmTask,
  type CrmTaskClock,
  type CrmTaskIds,
  type CrmTaskMutationResult,
} from './index';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const staffActor: CrmActorContext = {
  actorId: 'staff-1',
  role: 'staff',
  scope: { staffId: 'staff-1' },
  tenantId: 'tenant-1',
};

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

const memberActor: CrmActorContext = {
  actorId: 'member-1',
  role: 'member',
  scope: { memberId: 'member-1' },
  tenantId: 'tenant-1',
};

const tasksDir = dirname(fileURLToPath(import.meta.url));

function services(now = '2026-05-20T12:00:00.000Z', taskId = 'task-1'): CrmTaskClock & CrmTaskIds {
  return {
    now: () => now,
    taskId: () => taskId,
  };
}

function expectTask(result: CrmTaskMutationResult): CrmTask {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(`expected task, got ${result.reason}`);
  return result.task;
}

function createTask(
  overrides: {
    actor?: CrmActorContext;
    assignedBranchId?: string | null;
    dueAt?: string | null;
    existingTask?: CrmTask | null;
    idempotencyKey?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    subjectId?: string;
    tenantId?: string;
  } = {}
): CrmTaskMutationResult {
  return createCrmTask(
    {
      actor: overrides.actor ?? agentActor,
      assignedTo: {
        actorId: 'agent-1',
        branchId: overrides.assignedBranchId ?? 'branch-1',
        kind: 'actor',
        role: 'agent',
        tenantId: overrides.tenantId ?? 'tenant-1',
      },
      dueAt: overrides.dueAt ?? '2026-05-21T09:30:00+02:00',
      existingTask: overrides.existingTask,
      idempotencyKey: overrides.idempotencyKey ?? 'crm24-create-1',
      priority: overrides.priority ?? 'normal',
      subjectProof: {
        branchId: 'branch-1',
        subjectReference: { id: overrides.subjectId ?? 'lead-1', kind: 'lead' },
        tenantId: overrides.tenantId ?? 'tenant-1',
      },
      subjectReference: { id: overrides.subjectId ?? 'lead-1', kind: 'lead' },
      tenantId: overrides.tenantId ?? 'tenant-1',
    },
    services()
  );
}

describe('CRM task domain contracts', () => {
  it('creates a deterministic PII-safe pending task with injected ID and clock', () => {
    const task = expectTask(createTask());

    expect(task).toMatchObject({
      assignedTo: {
        actorId: 'agent-1',
        branchId: 'branch-1',
        kind: 'actor',
        role: 'agent',
        tenantId: 'tenant-1',
      },
      completedAt: null,
      createReasonCode: 'manual',
      createdAt: '2026-05-20T12:00:00.000Z',
      dueAt: '2026-05-21T07:30:00.000Z',
      branchId: 'branch-1',
      idempotencyKey: 'crm24-create-1',
      lifecycleVersion: 1,
      priority: 'normal',
      status: 'pending',
      subjectReference: { id: 'lead-1', kind: 'lead' },
      taskId: 'task-1',
      tenantId: 'tenant-1',
      updatedAt: '2026-05-20T12:00:00.000Z',
    });
    expect(task.createdBy).toEqual({
      actorId: 'agent-1',
      branchId: 'branch-1',
      role: 'agent',
      tenantId: 'tenant-1',
    });
    expect(task.history).toEqual([
      {
        actor: task.createdBy,
        event: 'created',
        fromStatus: null,
        reasonCode: 'manual',
        timestamp: '2026-05-20T12:00:00.000Z',
        toStatus: 'pending',
      },
    ]);
    expect(isCrmTaskTerminalStatus('completed')).toBe(true);
    expect(isCrmTaskTerminalStatus('cancelled')).toBe(true);
    expect(JSON.stringify(task)).not.toContain('Ju takojne 600');
    expect(JSON.stringify(task)).not.toContain('medical diagnosis');
  });

  it('fails closed for malformed actor, member actor, tenant mismatch, subject, priority, and due date', () => {
    expect(
      createTask({
        actor: { ...agentActor, actorId: '', role: 'agent' },
      })
    ).toMatchObject({ error: 'invalid_input', reason: 'actor_scope', success: false });

    expect(createTask({ actor: memberActor })).toMatchObject({
      error: 'forbidden',
      reason: 'role_scope',
      success: false,
    });

    expect(createTask({ actor: { ...agentActor, role: 'owner' as never } })).toMatchObject({
      error: 'forbidden',
      reason: 'role_scope',
      success: false,
    });

    expect(createTask({ tenantId: 'tenant-2' })).toMatchObject({
      error: 'forbidden',
      reason: 'tenant_scope',
      success: false,
    });

    expect(createTask({ subjectId: 'lead with spaces' })).toMatchObject({
      error: 'invalid_input',
      reason: 'invalid_subject_reference',
      success: false,
    });

    expect(
      createCrmTask(
        {
          actor: agentActor,
          assignedTo: { kind: 'unassigned' },
          priority: 'normal',
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        } as never,
        services()
      )
    ).toMatchObject({ error: 'invalid_input', reason: 'subject_proof_missing', success: false });

    expect(createTask({ priority: 'urgent' })).toMatchObject({ success: true });
    expect(createTask({ priority: 'unsupported' as unknown as 'low' })).toMatchObject({
      error: 'invalid_input',
      reason: 'invalid_priority',
      success: false,
    });

    expect(createTask({ dueAt: 'not-a-date' })).toMatchObject({
      error: 'invalid_input',
      reason: 'invalid_due_at',
      success: false,
    });

    expect(
      createCrmTask(
        {
          actor: agentActor,
          assignedTo: { kind: 'unassigned' },
          priority: 'normal',
          subjectProof: {
            branchId: 'branch-1',
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        services('invalid-now')
      )
    ).toMatchObject({ error: 'invalid_input', reason: 'invalid_timestamp', success: false });
  });

  it('fails closed for cross-branch assignment by branch-limited actors', () => {
    expect(createTask({ assignedBranchId: 'branch-2' })).toMatchObject({
      error: 'forbidden',
      reason: 'branch_scope',
      success: false,
    });

    expect(
      createCrmTask(
        {
          actor: adminActor,
          assignedTo: { branchId: 'branch-2', kind: 'role', role: 'staff' },
          priority: 'high',
          subjectProof: {
            branchId: 'branch-2',
            subjectReference: { id: 'support-1', kind: 'support_handoff' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'support-1', kind: 'support_handoff' },
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({ success: true });

    expect(
      createCrmTask(
        {
          actor: staffActor,
          assignedTo: { branchId: 'branch-2', kind: 'role', role: 'staff' },
          priority: 'high',
          subjectProof: {
            branchId: 'branch-2',
            subjectReference: { id: 'support-1', kind: 'support_handoff' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'support-1', kind: 'support_handoff' },
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({ error: 'forbidden', reason: 'branch_scope', success: false });

    expect(
      createCrmTask(
        {
          actor: agentActor,
          assignedTo: { kind: 'unassigned' },
          priority: 'normal',
          subjectProof: {
            branchId: null,
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({ error: 'forbidden', reason: 'branch_scope', success: false });

    const branchOneTask = expectTask(createTask());
    expect(
      assignCrmTask(
        branchOneTask,
        {
          actor: adminActor,
          assignedTo: { branchId: 'branch-2', kind: 'role', role: 'staff' },
          reasonCode: 'reassignment',
        },
        services('2026-05-20T13:00:00Z')
      )
    ).toMatchObject({ error: 'forbidden', reason: 'branch_scope', success: false });
  });

  it('supports explicit transitions with monotonic timestamps and append-style history', () => {
    const pending = expectTask(createTask());
    const started = expectTask(
      startCrmTask(pending, { actor: agentActor }, services('2026-05-20T13:00:00Z'))
    );
    const completed = expectTask(
      completeCrmTask(
        started,
        { actor: agentActor, reasonCode: 'resolved' },
        services('2026-05-20T14:00:00Z')
      )
    );
    const reopened = expectTask(
      reopenCrmTask(
        completed,
        { actor: agentActor, reasonCode: 'follow_up_required' },
        services('2026-05-20T15:00:00Z')
      )
    );

    expect(started.status).toBe('in_progress');
    expect(started.lifecycleVersion).toBe(2);
    expect(completed.status).toBe('completed');
    expect(completed.lifecycleVersion).toBe(3);
    expect(completed.completedAt).toBe('2026-05-20T14:00:00.000Z');
    expect(reopened.status).toBe('in_progress');
    expect(reopened.lifecycleVersion).toBe(4);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.history.map(entry => entry.event)).toEqual([
      'created',
      'started',
      'completed',
      'reopened',
    ]);
    expect(reopened.history.at(-1)).toMatchObject({
      fromStatus: 'completed',
      reasonCode: 'follow_up_required',
      toStatus: 'in_progress',
    });
  });

  it('blocks terminal and non-monotonic mutations fail closed', () => {
    const pending = expectTask(createTask());
    const cancelled = expectTask(
      cancelCrmTask(
        pending,
        { actor: agentActor, reasonCode: 'created_in_error' },
        services('2026-05-20T13:00:00Z')
      )
    );

    expect(
      reopenCrmTask(
        cancelled,
        { actor: agentActor, reasonCode: 'manually_reopened' },
        services('2026-05-20T14:00:00Z')
      )
    ).toMatchObject({ error: 'terminal_state', reason: 'terminal_state', success: false });

    expect(
      completeCrmTask(
        pending,
        {
          actor: {
            ...agentActor,
            actorId: 'agent-2',
            scope: { agentId: 'agent-2', branchId: 'branch-2' },
          },
          reasonCode: 'resolved',
        },
        services('2026-05-20T13:00:00Z')
      )
    ).toMatchObject({ error: 'forbidden', reason: 'branch_scope', success: false });

    expect(
      updateCrmTaskDueAt(
        pending,
        { actor: agentActor, dueAt: '2026-05-22T09:00:00Z', reasonCode: 'due_date_changed' },
        services('2026-05-20T11:00:00Z')
      )
    ).toMatchObject({
      error: 'invalid_input',
      reason: 'non_monotonic_timestamp',
      success: false,
    });
  });

  it('handles idempotent create, due-date no-op, and terminal duplicate completion explicitly', () => {
    const task = expectTask(createTask());

    expect(createTask({ existingTask: task })).toMatchObject({
      idempotent: true,
      success: true,
      task,
      transition: null,
    });

    expect(createTask({ existingTask: { ...task, priority: 'urgent' } })).toMatchObject({
      error: 'idempotent_conflict',
      reason: 'duplicate_idempotency_conflict',
      success: false,
    });

    expect(
      createCrmTask(
        {
          actor: agentActor,
          assignedTo: task.assignedTo,
          createReasonCode: 'follow_up',
          existingTask: task,
          idempotencyKey: 'crm24-create-1',
          priority: 'normal',
          subjectProof: {
            branchId: 'branch-1',
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          taskId: 'task-2',
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({
      error: 'idempotent_conflict',
      reason: 'duplicate_idempotency_conflict',
      success: false,
    });

    const adminUnassigned = expectTask(
      createCrmTask(
        {
          actor: adminActor,
          assignedTo: { kind: 'unassigned' },
          idempotencyKey: 'admin-unassigned',
          priority: 'normal',
          subjectProof: {
            branchId: 'branch-1',
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        services()
      )
    );
    expect(
      createCrmTask(
        {
          actor: adminActor,
          assignedTo: { kind: 'unassigned' },
          existingTask: adminUnassigned,
          idempotencyKey: 'admin-unassigned',
          priority: 'normal',
          subjectProof: {
            branchId: 'branch-2',
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({
      error: 'idempotent_conflict',
      reason: 'duplicate_idempotency_conflict',
      success: false,
    });

    expect(
      createCrmTask(
        {
          actor: agentActor,
          assignedTo: task.assignedTo,
          existingTask: { ...task, idempotencyKey: null },
          idempotencyKey: null,
          priority: 'normal',
          subjectProof: {
            branchId: 'branch-1',
            subjectReference: { id: 'lead-1', kind: 'lead' },
            tenantId: 'tenant-1',
          },
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        services()
      )
    ).toMatchObject({
      error: 'invalid_input',
      reason: 'invalid_idempotency_key',
      success: false,
    });

    expect(
      updateCrmTaskDueAt(
        task,
        { actor: agentActor, dueAt: '2026-05-21T07:30:00.000Z', reasonCode: 'due_date_changed' },
        services('2026-05-20T13:00:00Z')
      )
    ).toMatchObject({ idempotent: true, success: true, task, transition: null });

    expect(
      assignCrmTask(
        task,
        {
          actor: agentActor,
          assignedTo: task.assignedTo,
          reasonCode: 'manual_assignment',
        },
        services('2026-05-20T11:00:00Z')
      )
    ).toMatchObject({ idempotent: true, success: true, task, transition: null });

    const completed = expectTask(
      completeCrmTask(
        task,
        { actor: agentActor, reasonCode: 'resolved' },
        services('2026-05-20T13:00:00Z')
      )
    );

    expect(
      completeCrmTask(
        completed,
        { actor: agentActor, reasonCode: 'resolved' },
        services('2026-05-20T14:00:00Z')
      )
    ).toMatchObject({ idempotent: true, success: true, task: completed, transition: null });

    expect(
      completeCrmTask(
        completed,
        { actor: agentActor, reasonCode: 'duplicate' },
        services('2026-05-20T14:00:00Z')
      )
    ).toMatchObject({ error: 'terminal_state', reason: 'terminal_state', success: false });
  });

  it('keeps raw narrative-like caller fields out of public task output', () => {
    const result = createCrmTask(
      {
        actor: agentActor,
        assignedTo: {
          actorId: 'agent-1',
          branchId: 'branch-1',
          kind: 'actor',
          role: 'agent',
          tenantId: 'tenant-1',
          unsafeMedicalNarrative: 'medical diagnosis: fracture',
        } as never,
        createReasonCode: 'assistance_review',
        idempotencyKey: 'crm24-sensitive-create',
        priority: 'normal',
        subjectProof: {
          branchId: 'branch-1',
          subjectReference: { id: 'lead-1', kind: 'lead' },
          tenantId: 'tenant-1',
        },
        subjectReference: {
          id: 'lead-1',
          kind: 'lead',
          rawInsurerLetter: 'insurer says liability accepted',
        } as never,
        tenantId: 'tenant-1',
        unsafeSupportMessage: 'please submit to airline without POA',
      } as never,
      services()
    );

    const task = expectTask(result);
    const serialized = JSON.stringify(task);
    expect(serialized).not.toContain('medical diagnosis');
    expect(serialized).not.toContain('insurer says liability');
    expect(serialized).not.toContain('without POA');
    expect(serialized).toContain('assistance_review');
  });

  it('keeps the task module free of forbidden cross-domain and runtime imports', () => {
    const forbiddenPatterns = [
      '@interdomestik/domain-assistance',
      '@interdomestik/domain-privacy',
      '@interdomestik/domain-claims',
      '@interdomestik/database',
      'drizzle',
      'apps/web',
      'server-action',
      'outbox/',
      'scheduler',
      'notification',
      'openai',
    ];

    const source = readdirSync(tasksDir)
      .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map(file => readFileSync(join(tasksDir, file), 'utf8'))
      .join('\n');

    for (const pattern of forbiddenPatterns) {
      expect(source).not.toContain(pattern);
    }
  });
});
