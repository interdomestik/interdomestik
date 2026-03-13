import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitFreeStartIntakeCore } from './submit.core';

const mockCaptureException = vi.fn();
const mockRateLimit = vi.fn();
const mockRunCommercialActionWithIdempotency = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

describe('actions/free-start submitFreeStartIntakeCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockImplementation(async ({ execute }) => execute());
  });

  const validInput = {
    category: 'property',
    counterparty: 'Building insurer',
    desiredOutcome: 'repair',
    incidentDate: '2026-03-01',
    issueType: 'water_damage',
    summary: 'Water entered through the roof after a storm and damaged two rooms.',
  } as const;

  it('returns validated commercial intake payload on success', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });

    const result = await submitFreeStartIntakeCore({
      idempotencyKey: 'free-start-1',
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: true,
      data: {
        claimCategory: 'property',
        desiredOutcome: 'repair',
        intakeIssue: 'water_damage',
      },
    });
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'free-start.submit',
        idempotencyKey: 'free-start-1',
        requestFingerprint: validInput,
      })
    );
  });

  it('rejects issue types that do not match the selected category', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: false });

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: {
        ...validInput,
        category: 'vehicle',
      },
    });

    expect(result).toEqual({
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: {
        issueType: 'Issue type must match the selected category.',
      },
    });
  });

  it('returns a rate-limit error when submission is throttled', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: true });

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
  });

  it('captures idempotency execution failures and returns an internal error', async () => {
    const failure = new Error('idempotency exploded');
    mockRunCommercialActionWithIdempotency.mockRejectedValueOnce(failure);

    const result = await submitFreeStartIntakeCore({
      requestHeaders: new Headers(),
      data: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(mockCaptureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: {
          action: 'submitFreeStartIntake',
          feature: 'free-start',
        },
      })
    );
  });
});
