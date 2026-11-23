import { MissingTenantError } from '@interdomestik/shared-auth';
import { acceptanceMocks, memberUser } from '@/lib/privacy/member-acceptance-denial.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getAiRun: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@interdomestik/domain-ai', () => ({
  getAiRun: hoisted.getAiRun,
}));

function runRequest(): Request {
  return new Request('http://localhost:3000/api/ai/runs/run-1');
}

describe('GET /api/ai/runs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    acceptanceMocks.readAcceptance.mockResolvedValue({ accepted: true });
  });

  it('returns 401 when unauthenticated', async () => {
    acceptanceMocks.authorize.mockResolvedValueOnce(null);

    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'UNAUTHORIZED' });
  });

  it('returns 401 when the session is missing tenant identity', async () => {
    acceptanceMocks.authorize.mockRejectedValueOnce(new MissingTenantError());

    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'UNAUTHORIZED' });
    expect(hoisted.getAiRun).not.toHaveBeenCalled();
  });

  it('returns identical 404 responses for missing and other-requester runs', async () => {
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

    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });

    hoisted.getAiRun.mockResolvedValueOnce(null);
    const missing = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });
    expect(response.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await response.json()).toEqual(await missing.json());
  });

  it('refuses unaccepted sessions before reading an AI run', async () => {
    acceptanceMocks.readAcceptance.mockResolvedValueOnce({ accepted: false, missing: [] });
    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(hoisted.getAiRun).not.toHaveBeenCalled();
  });

  it('returns the tenant-scoped run for the requesting member', async () => {
    hoisted.getAiRun.mockResolvedValue({
      id: 'run-1',
      workflow: 'policy_extract',
      status: 'completed',
      workflowState: 'needs_review',
      documentId: 'document-1',
      entityType: 'policy',
      entityId: 'policy-1',
      requestedBy: memberUser.id,
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

    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(200);
    expect(hoisted.getAiRun).toHaveBeenCalledWith({
      authority: expect.anything(),
      runId: 'run-1',
    });
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

  it('returns the rate-limit response when polling exceeds the limit', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    );

    const response = await GET(runRequest(), { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'Too many requests' });
    expect(acceptanceMocks.authorize).not.toHaveBeenCalled();
  });
});
