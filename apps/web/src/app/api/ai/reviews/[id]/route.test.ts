import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  submitAiReview: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('./_core', () => ({
  submitAiReview: hoisted.submitAiReview,
}));

describe('POST /api/ai/reviews/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/ai/reviews/run-1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when caller is not privileged', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });

    const request = new Request('http://localhost:3000/api/ai/reviews/run-1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('submits correction payloads for privileged reviewers', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
    });
    hoisted.submitAiReview.mockResolvedValue({
      kind: 'ok',
      data: {
        id: 'run-1',
        reviewStatus: 'corrected',
      },
    });

    const request = new Request('http://localhost:3000/api/ai/reviews/run-1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'correct',
        correctedExtraction: {
          provider: 'Carrier Co',
          policyNumber: 'POL-123',
          coverageAmount: 5000,
          currency: 'EUR',
          deductible: 100,
          confidence: 0.91,
          warnings: ['Member confirmed deductible'],
        },
      }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'run-1' }) });

    expect(hoisted.submitAiReview).toHaveBeenCalledWith({
      runId: 'run-1',
      tenantId: 'tenant-1',
      reviewerId: 'staff-1',
      reviewerRole: 'staff',
      action: 'correct',
      correctedExtraction: {
        provider: 'Carrier Co',
        policyNumber: 'POL-123',
        coverageAmount: 5000,
        currency: 'EUR',
        deductible: 100,
        confidence: 0.91,
        warnings: ['Member confirmed deductible'],
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'run-1',
      reviewStatus: 'corrected',
    });
  });
});
