import { describe, expect, it, vi } from 'vitest';

import { submitFreeStartIntakeCore } from './submit.core';

const mockRateLimit = vi.fn();

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('actions/free-start submitFreeStartIntakeCore', () => {
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
});
