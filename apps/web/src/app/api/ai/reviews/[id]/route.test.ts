import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
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

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('./_core', () => ({
  submitAiReview: hoisted.submitAiReview,
}));

function approveReviewRequest(): Request {
  return new Request('http://localhost:3000/api/ai/reviews/run-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
}

describe('POST /api/ai/reviews/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const response = await POST(approveReviewRequest(), {
      params: Promise.resolve({ id: 'run-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when the session is missing tenant identity', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'staff-1', role: 'staff', tenantId: undefined },
    });

    const response = await POST(approveReviewRequest(), {
      params: Promise.resolve({ id: 'run-1' }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Missing tenant identity' });
    expect(hoisted.submitAiReview).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not privileged', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
    });

    const response = await POST(approveReviewRequest(), {
      params: Promise.resolve({ id: 'run-1' }),
    });

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

  it('returns the rate-limit response before parsing the review payload', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      })
    );

    const response = await POST(approveReviewRequest(), {
      params: Promise.resolve({ id: 'run-1' }),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'Too many requests' });
    expect(hoisted.getSession).not.toHaveBeenCalled();
    expect(hoisted.submitAiReview).not.toHaveBeenCalled();
  });
});
