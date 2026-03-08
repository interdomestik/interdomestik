import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getAiRun: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@interdomestik/domain-ai', () => ({
  getAiRun: hoisted.getAiRun,
}));

describe('GET /api/ai/runs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/ai/runs/run-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when a member requests another users run', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.getAiRun.mockResolvedValue({
      id: 'run-1',
      workflow: 'policy_extract',
      status: 'processing',
      workflowState: 'processing',
      documentId: 'document-1',
      entityType: 'policy',
      entityId: 'policy-1',
      requestedBy: 'member-2',
      reviewStatus: 'pending',
      errorCode: null,
      errorMessage: null,
      warnings: [],
      extraction: null,
      createdAt: '2026-03-08T12:00:00.000Z',
      startedAt: '2026-03-08T12:01:00.000Z',
      completedAt: null,
    });

    const request = new Request('http://localhost:3000/api/ai/runs/run-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns the tenant-scoped run for the requesting member', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.getAiRun.mockResolvedValue({
      id: 'run-1',
      workflow: 'policy_extract',
      status: 'completed',
      workflowState: 'needs_review',
      documentId: 'document-1',
      entityType: 'policy',
      entityId: 'policy-1',
      requestedBy: 'member-1',
      reviewStatus: 'pending',
      errorCode: null,
      errorMessage: null,
      warnings: ['Confirm deductible'],
      extraction: {
        provider: 'Carrier Co',
        policyNumber: 'POL-123',
      },
      createdAt: '2026-03-08T12:00:00.000Z',
      startedAt: '2026-03-08T12:01:00.000Z',
      completedAt: '2026-03-08T12:02:00.000Z',
    });

    const request = new Request('http://localhost:3000/api/ai/runs/run-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'run-1',
      workflow: 'policy_extract',
      status: 'completed',
      workflowState: 'needs_review',
      reviewStatus: 'pending',
      warnings: ['Confirm deductible'],
      extraction: {
        provider: 'Carrier Co',
        policyNumber: 'POL-123',
      },
      createdAt: '2026-03-08T12:00:00.000Z',
      startedAt: '2026-03-08T12:01:00.000Z',
      completedAt: '2026-03-08T12:02:00.000Z',
      errorCode: null,
      errorMessage: null,
    });
  });
});
