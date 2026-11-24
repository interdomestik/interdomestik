import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateClaimPackCore } from './claim-pack-internal';
import { generateClaimPackAction } from './claim-pack.core';

const mockRateLimit = vi.fn();
const admit = vi.fn();
vi.mock('@/lib/tenant/public-admission-tenant', () => ({
  resolvePublicAdmissionTenant: () => 'tenant_ks',
}));
vi.mock('@/lib/tenant/public-intake-admission', () => ({
  authorizeOpenPublicIntake: (...args: unknown[]) => admit(...args),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: (...args: unknown[]) => mockRateLimit(...args),
}));

describe('actions/claim-pack generateClaimPackCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ limited: false });
    admit.mockResolvedValue({});
  });

  const validInput = {
    claimType: 'vehicle',
    answers: {
      incidentDate: '2026-04-10',
      description: 'Rear-end collision at a junction with visible vehicle damage.',
      counterpartyName: 'Other driver',
      hasDamagePhotos: true,
      policeReportFiled: true,
      estimatedAmount: 150000,
    },
    generatedAt: '2026-04-24T08:00:00.000Z',
    locale: 'en',
  } as const;

  it('returns CLOSED through the action before parsing or rate limiting', async () => {
    admit.mockResolvedValueOnce(null);
    const input = {
      ...validInput,
      get answers(): typeof validInput.answers {
        throw new Error('input parsed');
      },
    };
    await expect(generateClaimPackAction(input)).resolves.toEqual({
      success: false,
      code: 'CLOSED',
      error: 'claimPack.CLOSED',
    });
    expect(admit).toHaveBeenCalledWith('tenant_ks');
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it('returns a generated pack for valid input', async () => {
    const result = await generateClaimPackCore({
      requestHeaders: new Headers(),
      input: validInput,
    });

    expect(result.success).toBe(true);
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'action:generate-claim-pack',
        productionSensitive: true,
      })
    );
    if (result.success) {
      expect(result.data.claimType).toBe('vehicle');
      expect(result.data.generatedAt).toBe('2026-04-24T08:00:00.000Z');
      expect(result.data.confidence.level).toBe('high');
      expect(result.data.evidenceChecklist.items[0]?.status).toBe('provided');
    }
  });

  it('returns validation errors for incomplete input', async () => {
    const result = await generateClaimPackCore({
      requestHeaders: new Headers(),
      input: {
        claimType: 'vehicle',
        answers: {
          incidentDate: '',
          description: 'short',
        },
      },
    });

    expect(result).toEqual({
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: expect.objectContaining({
        answers: expect.any(String),
      }),
    });
  });

  it('rejects oversized anonymous claim-pack payloads', async () => {
    const result = await generateClaimPackCore({
      requestHeaders: new Headers(),
      input: {
        ...validInput,
        answers: {
          ...validInput.answers,
          description: 'x'.repeat(1201),
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'INVALID_PAYLOAD',
      })
    );
  });

  it('rejects future incident dates', async () => {
    const result = await generateClaimPackCore({
      requestHeaders: new Headers(),
      input: {
        ...validInput,
        answers: {
          ...validInput.answers,
          incidentDate: '2999-01-01',
        },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        code: 'INVALID_PAYLOAD',
      })
    );
  });

  it('returns a rate-limit error when throttled', async () => {
    mockRateLimit.mockResolvedValueOnce({ limited: true });

    const result = await generateClaimPackCore({
      requestHeaders: new Headers(),
      input: validInput,
    });

    expect(result).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
  });
});
