import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALES,
  TEST_AUTHORITY,
  createInput,
  deps,
  hoisted,
  repository,
  session,
  task,
} from './crm-tasks.core.test-support';
import { createCrmTaskCore, readCrmTaskCore, updateCrmTaskDueAtCore } from './crm-tasks.core';

describe('CRM task core boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed for missing sessions before repository access', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await readCrmTaskCore({
      deps: d,
      authority: TEST_AUTHORITY,
      session: null,
      taskId: 'task-1',
    });

    expect(result).toEqual({ outcome: 'unauthorized', reason: 'missing_session' });
    expect(repo.findTaskById).not.toHaveBeenCalled();
    expect(d.rateLimit).not.toHaveBeenCalled();
  });

  it('fails closed without a tenant authority before any repository or rate-limit access', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await createCrmTaskCore({
      authority: null,
      deps: d,
      input: createInput(),
      requestHeaders: new Headers(),
      session: session(),
    });

    expect(result).toEqual({ outcome: 'unauthorized', reason: 'missing_session' });
    expect(d.rateLimit).not.toHaveBeenCalled();
    expect(repo.validateSubjectReference).not.toHaveBeenCalled();
    expect(hoisted.createCrmTaskRepository).not.toHaveBeenCalled();
  });

  it('builds the default repository from the session authority by identity', async () => {
    const defaultRepo = repository({ findTaskById: vi.fn().mockResolvedValue(null) });
    hoisted.createCrmTaskRepository.mockReturnValue(defaultRepo);

    const result = await readCrmTaskCore({
      authority: TEST_AUTHORITY,
      session: session(),
      taskId: 'task-1',
    });

    expect(result).toEqual({ outcome: 'not_found', reason: 'task_not_found' });
    expect(hoisted.createCrmTaskRepository).toHaveBeenCalledTimes(1);
    expect(hoisted.createCrmTaskRepository.mock.calls[0][0]).toBe(TEST_AUTHORITY);
    expect(defaultRepo.findTaskById).toHaveBeenCalled();
  });

  it('maps member task mutations to forbidden role scope', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      requestHeaders: new Headers({ 'user-agent': 'Vitest' }),
      authority: TEST_AUTHORITY,
      session: session({ role: 'member' }),
    });

    expect(result).toEqual({ outcome: 'forbidden', reason: 'role_scope' });
    expect(d.rateLimit).not.toHaveBeenCalled();
    expect(repo.validateSubjectReference).not.toHaveBeenCalled();
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('creates a task with subject proof, audit metadata, and locale CRM revalidation', async () => {
    const repo = repository();
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      requestHeaders: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expect(result.outcome).toBe('success');
    expect(repo.validateSubjectReference).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        role: 'agent',
        scope: expect.objectContaining({ branchId: 'branch-1' }),
        tenantId: 'tenant-1',
      }),
      subjectReference: { id: 'lead-1', kind: 'lead' },
    });
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({ actorId: 'agent-1', tenantId: 'tenant-1' }),
      task: expect.objectContaining({
        branchId: 'branch-1',
        idempotencyKey: 'idem-1',
        subjectReference: { id: 'lead-1', kind: 'lead' },
      }),
    });
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crm.task.created',
        actorId: 'agent-1',
        actorRole: 'agent',
        entityId: 'task-1',
        entityType: 'crm_task',
        metadata: {
          event: 'created',
          fromStatus: null,
          operation: 'created',
          reasonCode: 'manual',
          replay: false,
          subjectKind: 'lead',
          toStatus: 'pending',
        },
      })
    );
    expect(vi.mocked(d.audit).mock.calls[0][0].authority).toBe(TEST_AUTHORITY);
    for (const locale of LOCALES) {
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/agent/crm`);
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/staff/crm`);
      expect(d.revalidate).toHaveBeenCalledWith(`/${locale}/admin/crm`);
    }
    expect(JSON.stringify(vi.mocked(d.audit).mock.calls)).not.toContain('Sensitive lead note');
  });

  it('returns idempotent replay for an equivalent create without saving or revalidating', async () => {
    const existing = task();
    const repo = repository({
      findTaskByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    });
    const d = deps(repo);

    const result = await createCrmTaskCore({
      deps: d,
      input: createInput(),
      authority: TEST_AUTHORITY,
      session: session(),
    });

    expect(result).toEqual({
      outcome: 'idempotent_replay',
      reason: 'idempotent_replay',
      task: existing,
    });
    expect(repo.saveTask).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crm.task.created',
        metadata: expect.objectContaining({
          fromStatus: null,
          reasonCode: 'manual',
          replay: true,
          toStatus: 'pending',
        }),
      })
    );
  });

  it.each(['tenant_admin', 'super_admin'] as const)(
    'normalizes %s sessions to the admin CRM actor for reads',
    async role => {
      const existing = task({ branchId: 'branch-2' });
      const repo = repository({
        findTaskById: vi.fn().mockResolvedValue(existing),
      });

      const result = await readCrmTaskCore({
        deps: deps(repo),
        authority: TEST_AUTHORITY,
        session: session({ branchId: null, role }),
        taskId: 'task-1',
      });

      expect(result).toEqual({ outcome: 'success', task: existing });
      expect(repo.findTaskById).toHaveBeenCalledWith({
        actor: expect.objectContaining({
          actorId: 'agent-1',
          role: 'admin',
          scope: expect.objectContaining({ branchId: null, staffId: 'agent-1' }),
          tenantId: 'tenant-1',
        }),
        taskId: 'task-1',
      });
    }
  );

  it('normalizes tenant_admin sessions to the admin CRM actor for mutations', async () => {
    const existing = task({ branchId: 'branch-2', updatedAt: '2026-05-21T09:59:00.000Z' });
    const repo = repository({
      findTaskById: vi.fn().mockResolvedValue(existing),
    });
    const d = deps(repo);

    const result = await updateCrmTaskDueAtCore({
      deps: d,
      input: {
        dueAt: '2026-05-22T10:00:00.000Z',
        expectedLifecycleVersion: 1,
        reasonCode: 'due_date_changed',
        taskId: 'task-1',
      },
      authority: TEST_AUTHORITY,
      session: session({ branchId: null, role: 'tenant_admin' }),
    });

    expect(result.outcome).toBe('success');
    expect(repo.saveTask).toHaveBeenCalledWith({
      actor: expect.objectContaining({
        actorId: 'agent-1',
        role: 'admin',
        scope: expect.objectContaining({ branchId: null, staffId: 'agent-1' }),
        tenantId: 'tenant-1',
      }),
      expectedLifecycleVersion: 1,
      task: expect.objectContaining({
        dueAt: '2026-05-22T10:00:00.000Z',
        lifecycleVersion: 2,
      }),
    });
  });
});
